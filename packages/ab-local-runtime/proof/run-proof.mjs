import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RuntimeClient } from '../../ab-control/dist/runtime-adapter.mjs'
import { startOrcad, repoRoot } from '../../ab-control/tests/runtime-fixture.mjs'
import { sha256 } from '../policy.mjs'
import { BBRAINX_COMMIT, prepareContext } from './prepare-context.mjs'
import { verifyBlockedEgress } from './blocked-egress.mjs'
import { evaluateAnswer } from './evaluate-answer.mjs'

assert.equal(process.platform, 'linux', 'The PTY acceptance harness currently targets Linux only.')
const directory = process.env.AB_PROOF_DIRECTORY
  ? path.resolve(process.env.AB_PROOF_DIRECTORY)
  : await mkdtemp(path.join(tmpdir(), 'ab-local-proof-'))
const source = process.env.AB_BBRAINX_SOURCE
assert.ok(
  source && path.isAbsolute(source),
  'AB_BBRAINX_SOURCE must point to the installed official source.'
)
const originalContextRoot = path.join(repoRoot, 'packages/ab-context-bridge')
const contextRoot = path.join(directory, 'public-context-workspace')
const profile = path.join(directory, 'orcad-profile')
await mkdir(profile, { recursive: true })
await mkdir(contextRoot, { recursive: true })
const sourceCopy = []
for (const entry of await readdir(originalContextRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.mjs')) {
    continue
  }
  const sourceFile = path.join(originalContextRoot, entry.name)
  const destination = path.join(contextRoot, entry.name)
  await copyFile(sourceFile, destination)
  const hash = sha256(await readFile(sourceFile))
  assert.equal(sha256(await readFile(destination)), hash)
  sourceCopy.push({ path: entry.name, sha256: hash })
}
const network =
  process.env.AB_OFFLINE_REQUIRED === '1'
    ? await verifyBlockedEgress()
    : { mechanism: 'not-isolated; local functionality proof only', probe: null }
const prepared = await prepareContext({
  directory,
  source,
  contextRoot,
  endpoint: process.env.AB_OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11435'
})
const sourcePackage = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'))
assert.equal(sourcePackage.version, '2.4.0')
const shellQuote = (text) => `'${text.replaceAll("'", "'\"'\"'")}'`
let host, local, remote, terminalHandle

async function commandThroughPty(argumentsList, outputFile) {
  const nonce = randomBytes(16).toString('hex')
  const command = [
    process.execPath,
    path.join(repoRoot, 'packages/ab-local-runtime/dist/cli.mjs'),
    ...argumentsList
  ]
    .map(shellQuote)
    .join(' ')
  await remote.call('terminal.send', {
    terminal: terminalHandle,
    text: `${command} > ${shellQuote(outputFile)}; ab_task_code=$?; printf '%s%s:%s\\n' 'AB_LOCAL_' '${nonce}' "$ab_task_code"`,
    enter: true
  })
  const marker = `AB_LOCAL_${nonce}:`
  const deadline = Date.now() + 360000
  while (Date.now() < deadline) {
    const tail = (await remote.call('terminal.read', { terminal: terminalHandle, limit: 100 }))
      .result.terminal?.tail
    const output = JSON.stringify(tail)
    if (output.includes(marker)) {
      const record = JSON.parse(await readFile(outputFile, 'utf8'))
      assert.ok(output.includes(`${marker}0`), JSON.stringify(record.error ?? record))
      return record
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('The real PTY task exceeded its acceptance deadline.')
}

try {
  host = await startOrcad(profile)
  const pairing = host.ready.pairing?.url
  assert.ok(pairing)
  const port = Number(new URL(host.ready.advertisedEndpoint).port)
  local = new RuntimeClient(profile, 30000, null, null)
  remote = new RuntimeClient(profile, 30000, pairing, null)
  const first = (await remote.call('status.get')).result
  const group = (
    await local.call('projectGroup.create', {
      name: 'AB local inference proof',
      parentPath: path.dirname(contextRoot)
    })
  ).result.group
  const folder = (
    await local.call('folderWorkspace.create', {
      projectGroupId: group.id,
      folderPath: contextRoot,
      name: 'AB context public sources'
    })
  ).result.folderWorkspace
  prepared.config.contextBridge.binding.workspaceId = folder.id
  await writeFile(
    path.join(directory, 'config.json'),
    `${JSON.stringify(prepared.config, null, 2)}\n`,
    { mode: 0o600 }
  )
  terminalHandle = (
    await remote.call('terminal.create', {
      worktree: `id:folder:${folder.id}`,
      cwd: contextRoot,
      presentation: 'background'
    })
  ).result.terminal.handle
  const configFile = path.join(directory, 'config.json')
  const result = await commandThroughPty(
    ['submit', configFile, path.join(directory, 'request.json')],
    path.join(directory, 'task-result.json')
  )
  assert.equal(result.status, 'succeeded')
  assert.equal(result.context.origin.server.version, '2.4.0')
  assert.ok(result.context.sources.length > 0)
  assert.equal(result.provenance.context.sha256, sha256(JSON.stringify(result.context)))
  assert.equal(result.result.sha256, sha256(result.result.text))
  await host.stop()
  host = await startOrcad(profile, { port })
  const second = (await remote.call('status.get')).result
  assert.notEqual(second.runtimeId, first.runtimeId)
  assert.equal(second.hostDescriptor.installationId, first.hostDescriptor.installationId)
  const recovered = await commandThroughPty(
    ['get', configFile, result.id],
    path.join(directory, 'recovered-result.json')
  )
  assert.deepEqual(recovered, result)
  const repeated = await commandThroughPty(
    ['submit', configFile, path.join(directory, 'request.json')],
    path.join(directory, 'idempotent-result.json')
  )
  assert.deepEqual(repeated, result)
  const receipt = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? null,
    scope:
      'Real orcad pairing and folder PTY → official BBrainX MCP → pinned local Qwen CPU → durable answer and provenance → orcad/process restart and idempotent retrieval. Full desktop IDE behavior is not certified by this proof.',
    network,
    bbrainx: {
      version: sourcePackage.version,
      commit: BBRAINX_COMMIT,
      index: prepared.index,
      sourceCopy
    },
    host: {
      initialRuntimeId: first.runtimeId,
      restartedRuntimeId: second.runtimeId,
      installationId: first.hostDescriptor.installationId,
      workspaceId: folder.id,
      pairingVerified: true,
      ptyExecutionVerified: true,
      restartVerified: true
    },
    task: {
      id: result.id,
      status: result.status,
      packId: result.context.packId,
      promptSha256: result.prompt.sha256,
      resultSha256: result.result.sha256,
      contextSources: result.context.sources,
      model: result.provenance.model,
      provider: result.provenance.provider,
      restartResultIdentical: true,
      idempotentResultIdentical: true
    },
    quality: evaluateAnswer(result.result.text)
  }
  await writeFile(path.join(directory, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`)
  process.stdout.write(
    `${JSON.stringify({ receipt: path.join(directory, 'receipt.json'), taskId: result.id, status: result.status, network: network.mechanism })}\n`
  )
} finally {
  if (terminalHandle && local) {
    await local.call('terminal.close', { terminal: terminalHandle }).catch(() => {})
  }
  if (host) {
    await host.stop()
  }
}
