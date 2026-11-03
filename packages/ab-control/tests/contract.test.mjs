import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  chmodSync,
  statSync,
  lstatSync,
  symlinkSync,
  openSync,
  closeSync
} from 'node:fs'
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

test('private credentials create exclusively and rotate atomically without leftover staging files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ab-control-credentials-'))
  try {
    const file = join(dir, 'token')
    const unrelated = join(dir, 'token.unrelated.tmp')
    writeFileSync(unrelated, 'preserve unrelated staging file', { mode: 0o600 })
    assert.equal(createCredential(file), file)
    const first = readToken(file)
    const original = readFileSync(file)
    assert.match(first, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(original.toString(), `${first}\n`)
    assert.equal(tokenMatches(`Bearer ${first}`, first), true)
    assert.equal(tokenMatches(`Bearer ${first}x`, first), false)
    assert.deepEqual(readdirSync(dir).sort(), ['token', 'token.unrelated.tmp'])
    if (process.platform !== 'win32') {
      assert.equal(statSync(file).mode & 0o777, 0o600)
    }
    assert.throws(() => createCredential(file), { code: 'EEXIST' })
    assert.deepEqual(readFileSync(file), original)
    assert.deepEqual(readdirSync(dir).sort(), ['token', 'token.unrelated.tmp'])
    const reader = openSync(file, 'r')
    try {
      assert.equal(createCredential(file, { rotate: true }), file)
      assert.deepEqual(readFileSync(reader), original)
    } finally {
      closeSync(reader)
    }
    assert.notEqual(readToken(file), first)
    assert.equal(tokenMatches(`Bearer ${first}`, readToken(file)), false)
    assert.equal(readFileSync(file, 'utf8'), `${readToken(file)}\n`)
    assert.deepEqual(readdirSync(dir).sort(), ['token', 'token.unrelated.tmp'])
    assert.equal(readFileSync(unrelated, 'utf8'), 'preserve unrelated staging file')
    if (process.platform !== 'win32') {
      assert.equal(statSync(file).mode & 0o777, 0o600)
      const link = join(dir, 'link')
      const rotated = readFileSync(file)
      symlinkSync(file, link)
      assert.throws(() => readToken(link), /private credential/)
      assert.throws(() => createCredential(link, { rotate: true }), /private credential/)
      assert.equal(lstatSync(link).isSymbolicLink(), true)
      assert.deepEqual(readFileSync(file), rotated)
      chmodSync(file, 0o644)
      assert.throws(() => readToken(file), /private credential/)
      assert.throws(() => createCredential(file, { rotate: true }), /private credential/)
      assert.deepEqual(readFileSync(file), rotated)
      assert.deepEqual(readdirSync(dir).sort(), ['link', 'token', 'token.unrelated.tmp'])
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('rotation refuses missing and malformed credentials without publishing or changing bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ab-control-invalid-credentials-'))
  try {
    const file = join(dir, 'token')
    assert.throws(() => createCredential(file, { rotate: true }), {
      code: 'credential_unavailable'
    })
    assert.deepEqual(readdirSync(dir), [])
    writeFileSync(file, 'bad\n', { mode: 0o600 })
    assert.throws(() => readToken(file), /generated token/)
    assert.throws(() => createCredential(file, { rotate: true }), /generated token/)
    assert.equal(readFileSync(file, 'utf8'), 'bad\n')
    assert.deepEqual(readdirSync(dir), ['token'])
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
