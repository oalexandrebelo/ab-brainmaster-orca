import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createContextBridge, countContextTokens } from '../bridge.mjs'
import { sha256 } from '../contracts.mjs'
import { connectConfiguredMcp } from '../mcp-connection.mjs'
import { unwrapToolResult } from '../errors.mjs'

const binding = {
  workspaceId: 'folder:test',
  hostId: 'host-test',
  projectId: 'allowed',
  expectedRoot: '/remote/project'
}
const snapshot = sha256('fixture snapshot')
const hash = sha256('fixture file')
const catalog = [
  {
    name: 'projects',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'search',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        query: { type: 'string', maxLength: 1000 },
        budget: { type: 'integer', minimum: 256, maximum: 16000 }
      },
      required: ['project', 'query'],
      additionalProperties: false
    }
  },
  {
    name: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        path: { type: 'string' },
        start: { type: 'integer' },
        end: { type: 'integer' }
      },
      required: ['project', 'path'],
      additionalProperties: false
    }
  }
]

function harness(overrides = {}) {
  const calls = []
  const freshness = {
    status: 'current',
    observedAt: new Date().toISOString(),
    consistency: 'content-hash-scan-not-atomic',
    root: binding.expectedRoot,
    snapshot
  }
  const response = {
    project: binding.projectId,
    snapshot,
    freshness,
    items: [
      {
        id: '1',
        path: 'README.md',
        start_line: 1,
        end_line: 4,
        file_hash: hash,
        body: 'A concrete explanation of context selection and source provenance.'
      }
    ],
    truncated: false,
    omitted: 0
  }
  const client = {
    listTools: async () => ({ tools: catalog }),
    getServerVersion: () => ({ name: 'contract-fixture', version: '0' }),
    async callTool(request) {
      calls.push(request)
      if (request.name === 'projects') {
        return {
          structuredContent: { projects: [{ id: binding.projectId, root: binding.expectedRoot }] }
        }
      }
      if (request.name === 'search') {
        return { structuredContent: response }
      }
      return {
        structuredContent: {
          project: binding.projectId,
          path: 'README.md',
          snapshot,
          hash,
          freshness,
          start: 1,
          end: 4,
          totalLines: 4,
          text: '     1| source evidence'
        }
      }
    },
    ...overrides
  }
  return {
    client,
    calls,
    response,
    bridge: createContextBridge({ client, kind: 'ab-s00s', connectionId: 'contract-test', binding })
  }
}

test('Oficina schema: project discovery, exact arguments, bounded pack and verified read provenance', async () => {
  const { bridge, calls } = harness()
  const pack = await bridge.retrieve({
    query: 'context selection',
    budget: 600,
    windows: [{ path: 'README.md', start: 1, end: 4 }]
  })
  assert.deepEqual(
    calls.filter((call) => call.name === 'projects').map((call) => call.arguments),
    [{}, {}]
  )
  assert.deepEqual(calls.find((call) => call.name === 'search').arguments, {
    project: 'allowed',
    query: 'context selection',
    budget: 600
  })
  assert.deepEqual(calls.find((call) => call.name === 'read').arguments, {
    project: 'allowed',
    path: 'README.md',
    start: 1,
    end: 4
  })
  assert.match(pack.prompt.text, /source evidence/)
  assert.equal(pack.prompt.payloadTokens, countContextTokens(pack.prompt.text))
  assert.ok(pack.prompt.payloadTokens <= 600)
  assert.ok(pack.sources.every((source) => source.hash === hash))
  assert.equal(pack.binding.hostId, 'host-test')
})

test('catalog scope is rechecked before every retrieval; revocation prevents search', async () => {
  const { bridge, client, calls } = harness()
  await bridge.discover()
  const before = calls.length
  client.callTool = async (request) => {
    calls.push(request)
    return { structuredContent: { projects: [] } }
  }
  await assert.rejects(
    bridge.retrieve({ query: 'context' }),
    (error) => error.code === 'PROJECT_NOT_AVAILABLE'
  )
  assert.equal(calls.length, before + 1)
  assert.equal(calls.at(-1).name, 'projects')
})

test('budget omissions are explicit and no complete-coverage or billing claim is produced', async () => {
  const { bridge, response } = harness()
  response.items[0].body = 'Long evidence '.repeat(1200)
  response.reindexed = true
  const pack = await bridge.retrieve({ query: 'context', budget: 256 })
  assert.equal(pack.omissions[0].reason, 'prompt_budget')
  assert.equal(pack.sources.length, 0)
  assert.ok(pack.prompt.payloadTokens <= 256)
  assert.equal(pack.selection.reindexedByServer, true)
  assert.equal(pack.selection.coverageComplete, false)
  assert.equal(pack.prompt.providerInputTokens, null)
})

test('malformed content, cross-project results, stale freshness and mismatched read snapshot fail closed', async () => {
  for (const [patch, expected] of [
    [{ project: 'other' }, 'SCOPE_MISMATCH'],
    [{ freshness: { status: 'stale', snapshot } }, 'UNVERIFIED_CONTEXT'],
    [
      {
        items: [{ path: '../outside', start_line: 1, end_line: 1, file_hash: hash, body: 'escape' }]
      },
      'UNSAFE_PATH'
    ],
    [
      { items: [{ path: '.env', start_line: 1, end_line: 1, file_hash: hash, body: 'secret' }] },
      'SENSITIVE_PATH'
    ]
  ]) {
    const { bridge, response } = harness()
    Object.assign(response, patch)
    await assert.rejects(bridge.retrieve({ query: 'context' }), (error) => error.code === expected)
  }
  const { bridge, client } = harness()
  const original = client.callTool
  client.callTool = async (request) => {
    const result = await original(request)
    if (request.name === 'read') {
      result.structuredContent = {
        ...result.structuredContent,
        snapshot: sha256('changed'),
        freshness: { ...result.structuredContent.freshness, snapshot: sha256('changed') }
      }
    }
    return result
  }
  await assert.rejects(
    bridge.retrieve({ query: 'context', windows: [{ path: 'README.md', start: 1, end: 4 }] }),
    (error) => error.code === 'SNAPSHOT_CHANGED'
  )
})

test('remote codes survive both protocol envelopes without triggering fallback or writes', async () => {
  for (const code of ['INDEX_STALE', 'PROFILE_INACTIVE', 'ACCESS_DENIED', 'STORE_BUSY']) {
    for (const body of [
      { error: code, message: 'Preserved refusal' },
      { ok: false, data: null, error: code, detail: 'Preserved refusal' },
      { code, message: 'Preserved refusal' }
    ]) {
      assert.throws(
        () =>
          unwrapToolResult(
            { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] },
            'search'
          ),
        (error) => error.code === code && error.message === 'Preserved refusal'
      )
    }
  }
  assert.throws(
    () => unwrapToolResult({ content: [{ type: 'text', text: 'not-json' }] }, 'search'),
    (error) => error.code === 'MALFORMED_RESPONSE'
  )
  const { bridge, client, calls } = harness()
  const original = client.callTool
  client.callTool = (request) =>
    request.name === 'search'
      ? Promise.resolve({ isError: true, structuredContent: { error: 'INDEX_STALE' } })
      : original(request)
  await assert.rejects(
    bridge.retrieve({ query: 'context' }),
    (error) => error.code === 'INDEX_STALE'
  )
  assert.ok(calls.every((call) => call.name === 'projects'))
})

test('incompatible schema and transport timeouts remain explicit', async () => {
  const incompatible = harness({
    listTools: async () => ({
      tools: catalog.map((tool) =>
        tool.name === 'projects'
          ? { ...tool, inputSchema: { ...tool.inputSchema, required: ['session'] } }
          : tool
      )
    })
  })
  await assert.rejects(
    incompatible.bridge.discover(),
    (error) => error.code === 'CONTRACT_INCOMPATIBLE'
  )
  const timeout = harness({
    listTools: async () => {
      throw Object.assign(new Error('sensitive endpoint'), { code: -32001 })
    }
  })
  await assert.rejects(
    timeout.bridge.discover(),
    (error) => error.code === 'TIMEOUT' && !error.message.includes('sensitive endpoint')
  )
  await assert.rejects(
    connectConfiguredMcp({ type: 'streamable-http', url: 'http://remote.invalid/api/mcp' }),
    (error) => error.code === 'INVALID_CONFIGURATION'
  )
  await assert.rejects(
    connectConfiguredMcp({ type: 'stdio', command: 'node', args: [] }),
    (error) => error.code === 'INVALID_CONFIGURATION'
  )
})
