import { spawnProcess } from '@orca/process-host'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const repoRoot = resolve(import.meta.dirname, '../../..')
export const orcadRoot = process.env.AB_ORCAD_TEST_ROOT ?? join(repoRoot, 'out/orcad')
export function pinnedNode(root = orcadRoot) {
  const hash = readFileSync(join(root, '.runtime-node'), 'utf8').trim()
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error('Invalid packaged Node marker')
  }
  return join(
    root,
    '..',
    'runtimes',
    `node-${hash}`,
    process.platform === 'win32' ? 'node.exe' : 'bin/node'
  )
}

export async function startOrcad(profile, { port = 0, root = orcadRoot } = {}) {
  const child = spawnProcess({
    program: pinnedNode(root),
    args: [join(root, 'orcad.js'), '--port', String(port), '--bind', '127.0.0.1', '--json'],
    env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', ORCA_USER_DATA: profile },
    stdio: 'pipe'
  })
  child.stdin.end()
  let diagnostic = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    diagnostic = (diagnostic + chunk).slice(-12000)
  })
  const ready = await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`orcad readiness timed out: ${diagnostic}`))
    }, 120000)
    let buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        try {
          const payload = JSON.parse(line)
          if (payload.type === 'orca_server_ready') {
            clearTimeout(timeout)
            resolveReady(payload)
          }
        } catch {
          /* Only the structured readiness record is consumed. */
        }
      }
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`orcad exited ${code}: ${diagnostic}`))
    })
  })
  return {
    child,
    ready,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) {
        return
      }
      await new Promise((resolveExit, reject) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          reject(new Error('orcad failed graceful shutdown'))
        }, 15000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolveExit()
        })
        child.kill('SIGTERM')
      })
    }
  }
}
