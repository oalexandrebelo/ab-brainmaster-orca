import { build } from 'esbuild'
import { once } from 'node:events'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { loadAgentSessionClaimSigner } from './agent-session-claim-identity'

const KEY_FILE = 'agent-session-authority.key'
const roots: string[] = []
let bundleDirectory: string
let signerModule: string

beforeAll(async () => {
  bundleDirectory = mkdtempSync(join(tmpdir(), 'orca-claim-key-bundle-'))
  signerModule = join(bundleDirectory, 'claim-identity.cjs')
  await build({
    entryPoints: [
      resolve('src/main/runtime/agent-session/ownership/agent-session-claim-identity.ts')
    ],
    outfile: signerModule,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent'
  })
})

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

afterAll(() => rmSync(bundleDirectory, { recursive: true, force: true }))

function newProfile(): string {
  const root = mkdtempSync(join(tmpdir(), 'orca-claim-key-'))
  roots.push(root)
  return join(root, 'new-parent', 'profile')
}

async function concurrentCreators(profileDirectory: string): Promise<string[]> {
  const workers = Array.from(
    { length: 8 },
    () =>
      new Worker(
        `
          const { parentPort, workerData } = require('node:worker_threads')
          const { loadAgentSessionClaimSigner } = require(workerData.signerModule)
          parentPort.once('message', () => {
            const signer = loadAgentSessionClaimSigner(workerData.profileDirectory, 'profile')
            parentPort.postMessage(signer.keyId)
            parentPort.close()
          })
          parentPort.postMessage('ready')
        `,
        { eval: true, workerData: { signerModule, profileDirectory } }
      )
  )
  try {
    const ready = await Promise.all(workers.map((worker) => once(worker, 'message')))
    expect(ready).toEqual(workers.map(() => ['ready']))
    const completed = Promise.all([
      Promise.all(workers.map((worker) => once(worker, 'message'))),
      Promise.all(workers.map((worker) => once(worker, 'exit')))
    ])
    for (const worker of workers) {
      worker.postMessage('create')
    }
    const [messages, exits] = await completed
    expect(exits).toEqual(workers.map(() => [0]))
    return messages.map(([keyId]) => String(keyId))
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()))
  }
}

describe('agent session claim key persistence', () => {
  it('creates a private complete key in a new directory tree and reuses its bytes', () => {
    const profile = newProfile()
    const keyPath = join(profile, KEY_FILE)
    const first = loadAgentSessionClaimSigner(profile, 'profile')
    const bytes = readFileSync(keyPath)
    expect(bytes).toHaveLength(32)
    expect(lstatSync(keyPath).isFile()).toBe(true)
    if (process.platform !== 'win32') {
      expect(lstatSync(keyPath).mode & 0o777).toBe(0o600)
    }
    expect(loadAgentSessionClaimSigner(profile, 'profile').keyId).toBe(first.keyId)
    expect(readFileSync(keyPath)).toEqual(bytes)
    expect(readdirSync(profile)).toEqual([KEY_FILE])
  })

  it('concurrent real creators adopt one complete key and remove their temporary files', async () => {
    const profile = newProfile()
    const keyIds = await concurrentCreators(profile)
    const persisted = loadAgentSessionClaimSigner(profile, 'profile')
    expect(keyIds).toEqual(Array.from({ length: 8 }, () => persisted.keyId))
    expect(readFileSync(join(profile, KEY_FILE))).toHaveLength(32)
    expect(readdirSync(profile)).toEqual([KEY_FILE])
  })

  it.each([0, 31, 33])('refuses an existing %i-byte corrupt key without replacing it', (size) => {
    const profile = newProfile()
    mkdirSync(profile, { recursive: true })
    const keyPath = join(profile, KEY_FILE)
    const corrupt = Buffer.alloc(size, 0x5a)
    writeFileSync(keyPath, corrupt, { mode: 0o600 })
    expect(() => loadAgentSessionClaimSigner(profile, 'profile')).toThrow(
      'agent_session_ownership_unknown'
    )
    expect(readFileSync(keyPath)).toEqual(corrupt)
    expect(readdirSync(profile)).toEqual([KEY_FILE])
  })
})
