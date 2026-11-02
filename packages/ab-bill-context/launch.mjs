import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  assertFingerprint,
  assertWorkingDirectory,
  startSidecar,
  stopOwnedChild
} from './runtime.mjs'
import { validateClaudeArguments } from './contracts.mjs'

export async function launch(planPath, args, baseEnv = process.env) {
  const plan = JSON.parse(await fs.readFile(planPath, 'utf8'))
  assertFingerprint(plan, { hash: true })
  await assertWorkingDirectory(plan.workspacePath)
  validateClaudeArguments(args)
  if (
    !baseEnv.ANTHROPIC_API_KEY ||
    baseEnv.ANTHROPIC_AUTH_TOKEN ||
    baseEnv.CLAUDE_CODE_USE_VERTEX === '1' ||
    baseEnv.CLAUDE_CODE_USE_BEDROCK === '1' ||
    baseEnv.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop'
  ) {
    throw new Error(
      'Esta integração exige Claude CLI com ANTHROPIC_API_KEY. OAuth, Desktop, Vertex e Bedrock ainda não são suportados.'
    )
  }
  const sidecar = await startSidecar(plan)
  const baseUrl = `${sidecar.origin}/bili/${plan.upstream}`
  const env = {
    ...baseEnv,
    ANTHROPIC_BASE_URL: baseUrl,
    DISABLE_AUTO_COMPACT: '1',
    BILI_AUTO_MODE_FORGE: '0',
    NO_PROXY: [baseEnv.NO_PROXY, '127.0.0.1', 'localhost', '::1'].filter(Boolean).join(','),
    no_proxy: [baseEnv.no_proxy, '127.0.0.1', 'localhost', '::1'].filter(Boolean).join(',')
  }
  const settings = JSON.stringify({
    env: { ANTHROPIC_BASE_URL: baseUrl, DISABLE_AUTO_COMPACT: '1' }
  })
  const client = spawn(plan.claudePath, ['--settings', settings, ...args], {
    env,
    stdio: 'inherit',
    shell: false
  })
  const onSignal = () => {
    void stopOwnedChild(client)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  let proxyFailed = false
  const onProxyExit = () => {
    if (client.exitCode === null && client.signalCode === null) {
      proxyFailed = true
      process.stderr.write(
        '\nContexto: o proxy encerrou. A sessão Claude foi interrompida; o histórico foi preservado. Não houve desvio para a API direta.\n'
      )
      void stopOwnedChild(client)
    }
  }
  sidecar.child.once('exit', onProxyExit)
  process.stderr.write(
    `Contexto: proxy local ${sidecar.health.version} pronto. Arquivos da sessão: ${sidecar.runDirectory}\n`
  )
  try {
    return await new Promise((resolve, reject) => {
      client.once('error', reject)
      client.once('exit', (code) => resolve(proxyFailed ? 1 : (code ?? 1)))
    })
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    sidecar.child.off('exit', onProxyExit)
    await stopOwnedChild(client)
    await sidecar.stop()
    await fs.writeFile(
      path.join(sidecar.runDirectory, 'closed.json'),
      `${JSON.stringify({ closedAt: new Date().toISOString(), proxyFailed })}\n`,
      { mode: 0o600 }
    )
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [planPath, separator, ...args] = process.argv.slice(2)
  if (!planPath || separator !== '--') {
    process.stderr.write('Uso interno: launch.mjs <plano> -- <argumentos Claude>\n')
    process.exitCode = 2
  } else {
    launch(planPath, args).then(
      (code) => {
        process.exitCode = code
      },
      (error) => {
        process.stderr.write(`Contexto: ${error.message}\n`)
        process.exitCode = 1
      }
    )
  }
}
