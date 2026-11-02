import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createContextBridge, countContextTokens } from '../bridge.mjs'
import { connectConfiguredMcp } from '../mcp-connection.mjs'
import { sha256 } from '../contracts.mjs'
import { unwrapToolResult } from '../errors.mjs'

const source = process.env.AB_BBRAINX_TEST_SOURCE

test(
  'official BBrainX MCP: verified context, scope, traversal, stale detection and explicit recovery',
  { skip: !source && 'Set AB_BBRAINX_TEST_SOURCE to the pinned official BBrainX checkout.' },
  async (t) => {
    const { version } = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'))
    assert.equal(version, '2.4.0')
    const { BrainStore } = await import(pathToFileURL(path.join(source, 'src/store.mjs')))
    const { indexProject } = await import(pathToFileURL(path.join(source, 'src/retrieval.mjs')))
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'ab-context-real-'))
    t.after(() => rm(temporary, { recursive: true, force: true }))
    const root = path.join(temporary, 'project with spaces')
    const state = path.join(temporary, 'state')
    await mkdir(root)
    const body =
      'export function verifiedContext(snapshot) {\n  return { snapshot, mode: "strict", purpose: "context provenance" }\n}\n'
    await writeFile(path.join(root, 'context.mjs'), body)
    await writeFile(
      path.join(root, 'README.md'),
      '# Context provenance\nRead source hashes before preparing the context. Never cross project scope.\n'
    )
    await writeFile(path.join(root, '.env'), 'PRIVATE_TEST_SECRET=must-not-enter-the-pack\n')
    const store = new BrainStore(state)
    store.register('bridge-test', root)
    indexProject(store, 'bridge-test')
    store.close()
    const transport = {
      type: 'stdio',
      command: process.execPath,
      args: [
        path.join(source, 'bin/bbrainx.mjs'),
        'mcp',
        '--project',
        'bridge-test',
        '--no-recruit',
        '--no-files'
      ],
      env: { BBRAINX_HOME: state }
    }
    let connection = await connectConfiguredMcp(transport)
    t.after(async () => connection.close())
    const binding = {
      workspaceId: 'folder:context-integration',
      hostId: null,
      projectId: 'bridge-test',
      expectedRoot: root
    }
    const settings = { kind: 'bbrainx', connectionId: 'local-real-test', binding }
    const bridge = createContextBridge({ ...settings, client: connection.client })
    const discovery = await bridge.discover()
    assert.equal(discovery.server.name, 'bbrainx')
    assert.equal(discovery.server.version, '2.4.0')
    assert.equal(discovery.scope.status, 'current')
    const pack = await bridge.retrieve({
      query: 'verifiedContext strict context provenance',
      budget: 1600,
      windows: [{ path: 'context.mjs', start: 1, end: 3 }]
    })
    assert.ok(
      pack.sources.some((item) => item.path === 'context.mjs' && item.hash === sha256(body))
    )
    assert.match(pack.prompt.text, /mode: "strict"/)
    assert.match(pack.prompt.text, /1\| export function/)
    assert.equal(pack.prompt.payloadTokens, countContextTokens(pack.prompt.text))
    assert.ok(pack.prompt.payloadTokens <= 1600)
    assert.equal(pack.prompt.sha256, sha256(pack.prompt.text))
    assert.ok(!pack.prompt.text.includes('PRIVATE_TEST_SECRET'))
    const denied = createContextBridge({
      ...settings,
      client: connection.client,
      binding: { ...binding, projectId: 'unrelated-project' }
    })
    await assert.rejects(denied.discover(), (error) => error.code === 'FORBIDDEN')
    const wrongRoot = createContextBridge({
      ...settings,
      client: connection.client,
      binding: { ...binding, expectedRoot: path.join(temporary, 'another-root') }
    })
    await assert.rejects(wrongRoot.discover(), (error) => error.code === 'SCOPE_MISMATCH')
    const traversal = await connection.client.callTool({
      name: 'context_read',
      arguments: { project: binding.projectId, path: '../outside.txt', start: 1, end: 1 }
    })
    assert.throws(
      () => unwrapToolResult(traversal, 'context_read'),
      (error) => error.code === 'UNSAFE_PATH'
    )
    const secret = await connection.client.callTool({
      name: 'context_read',
      arguments: { project: binding.projectId, path: '.env', start: 1, end: 1 }
    })
    assert.throws(
      () => unwrapToolResult(secret, 'context_read'),
      (error) => error.code === 'FILE_NOT_INDEXED'
    )
    await assert.rejects(
      bridge.retrieve({ query: 'context', windows: [{ path: '../outside.txt' }] }),
      (error) => error.code === 'UNSAFE_PATH'
    )
    await assert.rejects(
      bridge.retrieve({ query: 'context', windows: [{ path: 'context.mjs', start: 1, end: 401 }] }),
      (error) => error.code === 'INVALID_READ_RANGE'
    )
    const changed = body.replace('"strict"', '"strict-revised"')
    await writeFile(path.join(root, 'context.mjs'), changed)
    await assert.rejects(
      bridge.retrieve({ query: 'verifiedContext provenance' }),
      (error) => error.code === 'INDEX_STALE'
    )
    const rawStale = await connection.client.callTool({
      name: 'context_bootstrap',
      arguments: { project: binding.projectId, query: 'verifiedContext provenance' }
    })
    assert.throws(
      () => unwrapToolResult(rawStale, 'context_bootstrap'),
      (error) => error.code === 'INDEX_STALE'
    )
    await connection.close()
    await assert.rejects(
      bridge.retrieve({ query: 'context' }),
      (error) => error.code === 'CONNECTION_UNAVAILABLE'
    )
    const refreshedStore = new BrainStore(state)
    indexProject(refreshedStore, binding.projectId)
    refreshedStore.close()
    connection = await connectConfiguredMcp(transport)
    const resumed = createContextBridge({ ...settings, client: connection.client })
    const after = await resumed.retrieve({
      query: 'verifiedContext strict-revised provenance',
      budget: 700
    })
    assert.notEqual(after.snapshot, pack.snapshot)
    assert.match(after.prompt.text, /strict-revised/)
    assert.ok(after.sources.some((item) => item.hash === sha256(changed)))
  }
)
