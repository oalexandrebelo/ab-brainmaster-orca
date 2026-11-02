import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import {
  AUDITED_BILI_VERSION,
  proxyConfig,
  proxyEnvironment,
  SUPPORTED_PLATFORMS
} from './contracts.mjs'

const exec = promisify(execFile)
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

export function fingerprintFiles(plan) {
  return Object.fromEntries(
    ['nodePath', 'biliEntry', 'claudePath'].map((key) => {
      const stat = fs.statSync(plan[key])
      if (!stat.isFile()) {
        throw new Error(`${key} não é um arquivo.`)
      }
      fs.accessSync(plan[key], key === 'biliEntry' ? fs.constants.R_OK : fs.constants.X_OK)
      return [
        key,
        {
          path: fs.realpathSync(plan[key]),
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          sha256: digest(plan[key])
        }
      ]
    })
  )
}

export function assertFingerprint(plan, { hash = false } = {}) {
  for (const key of ['nodePath', 'biliEntry', 'claudePath']) {
    const expected = plan.fingerprints?.[key],
      stat = fs.statSync(plan[key])
    if (
      !expected ||
      fs.realpathSync(plan[key]) !== expected.path ||
      stat.size !== expected.size ||
      stat.mtimeMs !== expected.mtimeMs ||
      (hash && digest(plan[key]) !== expected.sha256)
    ) {
      throw new Error(
        'Um executável mudou depois da preparação. Verifique novamente no painel Contexto.'
      )
    }
  }
}

export async function assertWorkingDirectory(workspacePath, workingDirectory = process.cwd()) {
  const [root, current] = await Promise.all([
    fsp.realpath(workspacePath),
    fsp.realpath(workingDirectory)
  ])
  const relative = path.relative(root, current)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(
      'O terminal não está no workspace preparado. Verifique a configuração novamente.'
    )
  }
}

export async function prepareRuntime(setup) {
  if (!SUPPORTED_PLATFORMS.has(process.platform)) {
    throw new Error('Plataforma ainda não suportada.')
  }
  const workspace = await fsp.stat(setup.workspacePath)
  if (!workspace.isDirectory()) {
    throw new Error('Workspace local indisponível.')
  }
  const fingerprints = fingerprintFiles(setup)
  const manifestPath = path.join(path.dirname(path.dirname(setup.biliEntry)), 'package.json')
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'))
  if (
    manifest.name !== 'billion-context' ||
    manifest.version !== AUDITED_BILI_VERSION ||
    path.basename(setup.biliEntry) !== 'index.js' ||
    path.basename(path.dirname(setup.biliEntry)) !== 'dist'
  ) {
    throw new Error(`Use o dist/index.js oficial do billion-context ${AUDITED_BILI_VERSION}.`)
  }
  const env = proxyEnvironment(setup.dataDirectory)
  const node = await exec(setup.nodePath, ['--version'], {
    env,
    timeout: 4000,
    maxBuffer: 65536,
    shell: false
  })
  if (!/^v(?:2[4-9]|[3-9]\d)\./u.test(node.stdout.trim())) {
    throw new Error('Esta integração exige Node 24 ou superior, com SQLite nativo.')
  }
  const bili = await exec(setup.nodePath, [setup.biliEntry, '--version'], {
    env,
    timeout: 5000,
    maxBuffer: 65536,
    shell: false
  })
  if (
    !new RegExp(`^${AUDITED_BILI_VERSION.replaceAll('.', '\\.')}\\s*(?:\\(|$)`, 'u').test(
      bili.stdout.trim()
    )
  ) {
    throw new Error('A versão executada não corresponde à versão auditada.')
  }
  const claude = await exec(setup.claudePath, ['--version'], {
    env: { PATH: process.env.PATH },
    timeout: 5000,
    maxBuffer: 65536,
    shell: false
  })
  if (!/claude/iu.test(claude.stdout)) {
    throw new Error('O executável selecionado não se identificou como Claude.')
  }
  await fsp.mkdir(setup.dataDirectory, { recursive: true, mode: 0o700 })
  const plan = {
    ...setup,
    fingerprints,
    preparedAt: new Date().toISOString(),
    nodeVersion: node.stdout.trim(),
    biliVersion: bili.stdout.trim(),
    claudeVersion: claude.stdout.trim()
  }
  const planPath = path.join(setup.dataDirectory, `launch-${randomUUID()}.json`)
  await fsp.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return { plan, planPath }
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  return port
}

export async function stopOwnedChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return
  }
  child.kill('SIGTERM')
  for (let i = 0; i < 40 && child.exitCode === null && child.signalCode === null; i++) {
    await delay(50)
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    for (let i = 0; i < 40 && child.exitCode === null && child.signalCode === null; i++) {
      await delay(50)
    }
    if (child.exitCode === null && child.signalCode === null) {
      throw new Error('Não foi possível confirmar o encerramento do processo criado nesta sessão.')
    }
  }
}

export async function startSidecar(plan, { port: requestedPort, timeoutMs = 15_000 } = {}) {
  if (!SUPPORTED_PLATFORMS.has(process.platform)) {
    throw new Error('Plataforma ainda não suportada.')
  }
  const runDirectory = path.join(plan.dataDirectory, `session-${randomUUID()}`)
  await fsp.mkdir(runDirectory, { recursive: true, mode: 0o700 })
  const env = proxyEnvironment(runDirectory)
  env.BILI_PARENT_PID = String(process.pid)
  await fsp.writeFile(env.BILI_CONFIG_FILE, `${JSON.stringify(proxyConfig(plan), null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600
  })
  const port = requestedPort ?? (await freePort()),
    origin = `http://127.0.0.1:${port}`
  const child = spawn(
    plan.nodePath,
    [
      plan.biliEntry,
      'start',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--no-auto-update',
      '--config',
      env.BILI_CONFIG_FILE
    ],
    {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: false
    }
  )
  let launchError
  child.once('error', (error) => {
    launchError = error
  })
  // Discard upstream log content; it may include conversation text or endpoint details.
  child.stderr.resume()
  const deadline = Date.now() + timeoutMs
  try {
    while (Date.now() < deadline) {
      if (launchError) {
        throw new Error(`Falha ao iniciar proxy: ${launchError.code ?? 'processo'}.`)
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error('O proxy saiu antes de ficar disponível.')
      }
      try {
        const response = await fetch(`${origin}/__bili/health`, {
          signal: AbortSignal.timeout(350)
        })
        if (response.ok) {
          const health = await response.json()
          if (health.pid !== child.pid) {
            throw new Error(
              'Porta ocupada por outro processo; nenhuma instância externa foi anexada.'
            )
          }
          if (health.ok !== true || health.version !== AUDITED_BILI_VERSION) {
            throw new Error('O proxy não confirmou a versão esperada.')
          }
          if (health.watchdog?.armed !== true || health.watchdog?.parentPid !== process.pid) {
            throw new Error('O proxy não confirmou o supervisor esperado.')
          }
          await fsp.writeFile(
            path.join(runDirectory, 'receipt.json'),
            `${JSON.stringify({ pid: child.pid, origin, version: health.version, instanceId: health.instanceId, startedAt: new Date().toISOString(), status: 'ready' }, null, 2)}\n`,
            { flag: 'wx', mode: 0o600 }
          )
          return { child, origin, runDirectory, health, stop: () => stopOwnedChild(child) }
        }
      } catch (error) {
        if (/Porta ocupada|versão esperada|supervisor esperado/u.test(error.message)) {
          throw error
        }
      }
      await delay(100)
    }
    throw new Error('O proxy não ficou saudável dentro do prazo. O Claude não foi iniciado.')
  } catch (error) {
    await stopOwnedChild(child)
    throw error
  }
}
