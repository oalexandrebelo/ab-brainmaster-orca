import assert from 'node:assert/strict'
import { createWriteStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { homedir, userInfo } from 'node:os'
import path from 'node:path'
import { runProcess, spawnProcess } from '@orca/process-host'
import { verifyBlockedEgress } from './blocked-egress.mjs'

await verifyBlockedEgress()
const directory = process.env.AB_PROOF_DIRECTORY
assert.ok(directory && path.isAbsolute(directory))
await mkdir(directory, { recursive: true })
const identity = userInfo()
assert.ok(identity.uid > 0, 'The isolated proof must run as a nonroot user.')
assert.equal(identity.uid, Number(process.env.AB_PROOF_EXPECTED_UID))
assert.equal(identity.gid, Number(process.env.AB_PROOF_EXPECTED_GID))
assert.equal(homedir(), identity.homedir, 'The process home must match its container account.')
assert.equal((await stat(directory)).uid, identity.uid, 'Evidence directory ownership mismatch.')
await writeFile(
  path.join(directory, 'process-identity.json'),
  `${JSON.stringify({ uid: identity.uid, gid: identity.gid, username: identity.username, home: identity.homedir, evidenceOwnerMatches: true }, null, 2)}\n`,
  { mode: 0o600 }
)
const log = createWriteStream(path.join(directory, 'ollama.log'), { mode: 0o600 })
await once(log, 'open')
const server = spawnProcess({
  program: '/proof/ollama/bin/ollama',
  args: ['serve'],
  stdio: 'pipe',
  env: {
    ...process.env,
    OLLAMA_HOST: '127.0.0.1:11435',
    OLLAMA_MODELS: '/proof/models',
    OLLAMA_NO_CLOUD: '1',
    OLLAMA_NUM_PARALLEL: '1',
    OLLAMA_MAX_LOADED_MODELS: '1',
    OLLAMA_MAX_QUEUE: '1',
    CUDA_VISIBLE_DEVICES: '-1',
    ROCR_VISIBLE_DEVICES: '-1'
  }
})
server.stdin.end()
server.stdout.pipe(log, { end: false })
server.stderr.pipe(log, { end: false })
try {
  const deadline = Date.now() + 60000
  let ready = false
  while (Date.now() < deadline) {
    try {
      ready = (
        await fetch('http://127.0.0.1:11435/api/version', { signal: AbortSignal.timeout(1000) })
      ).ok
    } catch {}
    if (ready) {
      break
    }
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error('Ollama exited before readiness.')
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(ready, 'Ollama readiness timed out.')
  const result = await runProcess({
    program: process.execPath,
    args: [path.join(import.meta.dirname, 'run-proof.mjs')],
    env: {
      ...process.env,
      AB_OFFLINE_REQUIRED: '1',
      AB_BBRAINX_SOURCE: '/proof/bbrainx',
      AB_OLLAMA_ENDPOINT: 'http://127.0.0.1:11435',
      ORCA_BACKGROUND_LAUNCH: '1'
    },
    timeoutMs: 480000
  })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  assert.equal(result.code, 0, 'The real offline PTY proof failed.')
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, 'exit')
    server.kill('SIGTERM')
    await stopped
  }
  log.end()
}
