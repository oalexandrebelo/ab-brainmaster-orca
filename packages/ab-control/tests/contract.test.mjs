import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OPERATIONS, validateOperation } from '../contract.mjs'
import { createCredential, readToken, tokenMatches } from '../credentials.mjs'
import { ControlClient } from '../sdk.mjs'
import { createOpenApi } from '../openapi.mjs'

test('OpenAPI describes exactly the implemented operations and current envelopes', () => {
  const specification = createOpenApi()
  assert.equal(specification.openapi, '3.1.0')
  assert.deepEqual(
    JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8')),
    specification
  )
  assert.deepEqual(
    Object.keys(specification.paths),
    Object.keys(OPERATIONS).map((name) => `/v1/${name}`)
  )
  assert.equal(specification.components.schemas.Success.properties.contractVersion.const, 1)
  for (const [name, operation] of Object.entries(OPERATIONS)) {
    assert.deepEqual(
      specification.paths[`/v1/${name}`].post.requestBody.content['application/json'].schema,
      operation.inputSchema
    )
  }
})

test('the public contract cannot forward arbitrary RPC or mutation parameters', () => {
  assert.equal(Object.keys(OPERATIONS).length, 7)
  for (const name of ['terminal.send', 'rpc', '__proto__', 'constructor', 'agent.launch']) {
    assert.throws(() => validateOperation(name, {}), /Unknown/)
  }
  assert.throws(() => validateOperation('status', { method: 'agent.launch' }), /Unknown parameter/)
  assert.throws(
    () => validateOperation('terminal_read', { terminal: 'term', limit: 201 }),
    /Invalid limit/
  )
  assert.throws(
    () => validateOperation('terminal_read', { terminal: 'term', cursor: -1 }),
    /Invalid cursor/
  )
  assert.throws(
    () => validateOperation('terminal_wait', { terminal: 'term', timeoutMs: 5001 }),
    /Invalid timeout/
  )
  assert.throws(
    () => validateOperation('terminal_wait', { terminal: 'term', for: 'tui-idle' }),
    /Unknown parameter/
  )
  assert.deepEqual(validateOperation('terminal_wait', { terminal: 'term' }).params, {
    terminal: 'term',
    for: 'exit',
    timeoutMs: 1000
  })
  assert.deepEqual(validateOperation('terminals').params, {
    limit: 100,
    includePreview: false,
    includeVisualLayouts: false
  })
})

test('private credentials rotate without revealing the secret or following symlinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ab-control-credentials-'))
  try {
    const file = join(dir, 'token')
    assert.equal(createCredential(file), file)
    const first = readToken(file)
    assert.equal(tokenMatches(`Bearer ${first}`, first), true)
    assert.equal(tokenMatches(`Bearer ${first}x`, first), false)
    assert.throws(() => createCredential(file))
    createCredential(file, { rotate: true })
    assert.notEqual(readToken(file), first)
    assert.equal(tokenMatches(`Bearer ${first}`, readToken(file)), false)
    if (process.platform !== 'win32') {
      symlinkSync(file, join(dir, 'link'))
      assert.throws(() => readToken(join(dir, 'link')), /private credential/)
      chmodSync(file, 0o644)
      assert.throws(() => readToken(file), /private credential/)
    }
    writeFileSync(file, 'bad')
    assert.throws(() => readToken(file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('SDK refuses off-host endpoints, URLs with secrets and unbounded timeouts', () => {
  for (const url of [
    'https://127.0.0.1:8080',
    'http://example.com',
    'http://a:b@127.0.0.1',
    'http://127.0.0.1/secret',
    'http://127.0.0.1/?token=secret'
  ]) {
    assert.throws(() => new ControlClient({ url, tokenFile: 'unused' }))
  }
  assert.throws(() => new ControlClient({ url: 'http://127.0.0.1', timeoutMs: 30001 }))
})
