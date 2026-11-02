import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnProcess } from '@orca/process-host'
import { createLocalRuntime } from '../runtime.mjs'
import { sha256 } from '../policy.mjs'

const digest = '7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435'
const template = await readFile(path.join(import.meta.dirname, 'qwen3-template.txt'), 'utf8')
const body = {
  model: 'test:local',
  done: true,
  done_reason: 'stop',
  message: { content: 'Persisted answer; this is protocol fixture output.' },
  prompt_eval_count: 20,
  eval_count: 12
}
const request = { idempotencyKey: 'stable-key', task: 'Answer the question.' }

async function harness(
  t,
  chat = (_request, response) => response.end(JSON.stringify(body)),
  overrides = {}
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ab-local-contract-'))
  let chatCalls = 0
  let installedDigest = digest
  const server = http.createServer((incoming, response) => {
    incoming.resume()
    response.setHeader('content-type', 'application/json')
    if (incoming.url === '/api/tags') {
      response.end(JSON.stringify({ models: [{ name: 'test:local', digest: installedDigest }] }))
    } else if (incoming.url === '/api/version') {
      response.end(JSON.stringify({ version: 'protocol-fixture' }))
    } else if (incoming.url === '/api/show') {
      response.end(
        JSON.stringify({
          template,
          model_info: {
            'tokenizer.ggml.model': 'gpt2',
            'tokenizer.ggml.pre': 'qwen2',
            'tokenizer.ggml.add_bos_token': false
          }
        })
      )
    } else if (incoming.url === '/api/chat') {
      chatCalls += 1
      chat(incoming, response)
    } else {
      response.writeHead(404)
      response.end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const config = {
    stateDirectory: directory,
    provider: 'ollama',
    endpoint: `http://127.0.0.1:${server.address().port}`,
    model: 'test:local',
    allowedModels: [{ name: 'test:local', digest }],
    ...overrides
  }
  const runtimes = []
  const open = async () => {
    const runtime = await createLocalRuntime(config)
    runtimes.push(runtime)
    return runtime
  }
  t.after(async () => {
    for (const runtime of runtimes) {
      await runtime.close()
    }
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  })
  return {
    config,
    open,
    directory,
    chatCalls: () => chatCalls,
    setDigest: (value) => {
      installedDigest = value
    }
  }
}

test('endpoint and model policy fail before provider access', async (t) => {
  const h = await harness(t)
  for (const endpoint of [
    'https://api.example.com',
    'http://localhost:11434',
    'http://127.0.0.1:11434/redirect',
    'http://user:secret@127.0.0.1'
  ]) {
    await assert.rejects(createLocalRuntime({ ...h.config, endpoint }), {
      code: 'INVALID_CONFIGURATION'
    })
  }
  await assert.rejects(createLocalRuntime({ ...h.config, model: 'not-allowed' }), {
    code: 'INVALID_CONFIGURATION'
  })
  await assert.rejects(
    createLocalRuntime({
      ...h.config,
      allowedModels: [{ name: 'test:local', digest: 'b'.repeat(64) }]
    }),
    { code: 'MODEL_PROFILE_UNSUPPORTED' }
  )
  h.setDigest('b'.repeat(64))
  const runtime = await createLocalRuntime(h.config)
  try {
    const result = await runtime.submit(request)
    assert.equal(result.status, 'failed')
    assert.equal(result.error.code, 'MODEL_DIGEST_MISMATCH')
    assert.equal(result.result, null)
    assert.equal(h.chatCalls(), 0)
  } finally {
    await runtime.close()
  }
})

test('successful record, provenance and idempotency survive close and reopen', async (t) => {
  const h = await harness(t)
  let runtime = await h.open()
  const result = await runtime.submit(request)
  assert.equal(result.status, 'succeeded')
  assert.equal(result.result.sha256, sha256(body.message.content))
  assert.equal(result.provenance.model.digest, digest)
  assert.equal(result.provenance.promptSha256, sha256(JSON.stringify(result.prompt.messages)))
  await assert.rejects(createLocalRuntime(h.config), { code: 'STATE_BUSY' })
  assert.throws(() => runtime.submit({ ...request, task: 'different' }), {
    code: 'IDEMPOTENCY_CONFLICT'
  })
  await runtime.close()
  runtime = await h.open()
  assert.deepEqual(runtime.get(result.id), result)
  assert.deepEqual(await runtime.submit(request), result)
  assert.equal(h.chatCalls(), 1)
  assert.equal(runtime.list().length, 1)
})

test('concurrent admission is bounded and abort persists cancellation', async (t) => {
  let reached
  const atProvider = new Promise((resolve) => {
    reached = resolve
  })
  const h = await harness(t, () => reached())
  const runtime = await h.open()
  const controller = new AbortController()
  const pending = runtime.submit(request, { signal: controller.signal })
  await atProvider
  assert.throws(() => runtime.submit({ ...request, idempotencyKey: 'second' }), {
    code: 'RUNTIME_BUSY'
  })
  const repeat = runtime.submit(request)
  controller.abort()
  const result = await pending
  assert.equal(result.status, 'cancelled')
  assert.equal(result.result, null)
  assert.deepEqual(await repeat, result)
  assert.deepEqual(runtime.get(result.id), result)
  assert.equal(runtime.list().length, 1)
})

test('total deadline aborts a live provider request and records timeout', async (t) => {
  let reached
  const atProvider = new Promise((resolve) => {
    reached = resolve
  })
  const h = await harness(t, () => reached(), { limits: { timeoutMs: 100 } })
  const runtime = await h.open()
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const pending = runtime.submit(request)
  await atProvider
  t.mock.timers.tick(101)
  const result = await pending
  assert.equal(result.status, 'timed_out')
  assert.equal(result.error.code, 'TIMEOUT')
  assert.equal(runtime.get(result.id).status, 'timed_out')
  t.mock.timers.reset()
})

test('redirects, oversized output and excessive prompts produce no successful artifact', async (t) => {
  const redirected = await harness(t, (_request, response) => {
    response.writeHead(302, { location: 'https://example.com/' })
    response.end()
  })
  const runtime = await redirected.open()
  const redirect = await runtime.submit(request)
  assert.equal(redirect.status, 'failed')
  assert.equal(redirect.error.code, 'PROVIDER_REJECTED')
  const oversized = await harness(
    t,
    (_request, response) =>
      response.end(JSON.stringify({ ...body, message: { content: 'x'.repeat(100000) } })),
    { limits: { maxOutputBytes: 64 } }
  )
  const other = await oversized.open()
  const limit = await other.submit(request)
  assert.equal(limit.status, 'failed')
  assert.equal(limit.error.code, 'OUTPUT_LIMIT')
  const prompt = await harness(t, undefined, { limits: { maxPromptBytes: 1024 } })
  const bounded = await prompt.open()
  const rejected = await bounded.submit({ ...request, task: 'x'.repeat(1000) })
  assert.equal(rejected.status, 'failed')
  assert.equal(rejected.error.code, 'PROMPT_LIMIT')
  assert.equal(prompt.chatCalls(), 0)
  const window = await harness(t)
  const windowRuntime = await window.open()
  const oversizedWindow = await windowRuntime.submit({ ...request, task: 'x'.repeat(6000) })
  assert.equal(oversizedWindow.error.code, 'CONTEXT_WINDOW_LIMIT')
  assert.equal(window.chatCalls(), 0)
})

test('a killed process leaves an interrupted task that is recovered without inference replay', async (t) => {
  let reached
  const atProvider = new Promise((resolve) => {
    reached = resolve
  })
  const h = await harness(t, () => reached())
  const configFile = path.join(h.directory, 'config.json')
  await writeFile(configFile, JSON.stringify(h.config))
  const child = spawnProcess({
    program: process.execPath,
    args: [path.join(import.meta.dirname, 'crash-worker.mjs'), configFile],
    stdio: 'pipe'
  })
  child.stdin.end()
  child.stdout.resume()
  child.stderr.resume()
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
  })
  const stopped = once(child, 'exit')
  await Promise.race([
    atProvider,
    stopped.then(() => {
      throw new Error('Child exited before real provider admission')
    })
  ])
  child.kill('SIGKILL')
  await stopped
  const runtime = await h.open()
  const recovery = runtime.recover()
  assert.equal(recovery.interruptedTaskIds.length, 1)
  const result = runtime.get(recovery.interruptedTaskIds[0])
  assert.equal(result.status, 'interrupted')
  assert.equal(result.result, null)
  assert.equal(result.recovery.previousStatus, 'running')
  assert.equal(result.error.code, 'PROCESS_INTERRUPTED')
  assert.deepEqual(
    await runtime.submit({
      idempotencyKey: 'crash-recovery',
      task: 'Persist this task before provider completion.'
    }),
    result
  )
  assert.equal(h.chatCalls(), 1)
})

test('admission snapshots nested context windows before the caller can mutate them', async (t) => {
  const h = await harness(t)
  h.config.contextBridge = {
    kind: 'bbrainx',
    connectionId: 'unavailable-context',
    binding: {
      workspaceId: 'folder:test',
      hostId: null,
      projectId: 'test',
      expectedRoot: h.directory
    },
    transport: { type: 'stdio', command: path.join(h.directory, 'absent-context-server'), args: [] }
  }
  const runtime = await h.open()
  const input = {
    ...request,
    context: {
      query: 'bridge',
      budget: 1200,
      windows: [{ path: 'bridge.mjs', start: 241, end: 297 }]
    }
  }
  const original = structuredClone(input)
  const pending = runtime.submit(input)
  input.context.windows[0].path = 'caller-changed.mjs'
  input.context.windows[0].start = 1
  input.context.windows.push({ path: 'extra.mjs', start: 1, end: 10 })
  const record = await pending
  assert.equal(record.status, 'failed')
  assert.deepEqual(record.request.context, original.context)
  assert.deepEqual(runtime.get(record.id).request.context, original.context)
  assert.deepEqual(await runtime.submit(original), record)
  assert.throws(() => runtime.submit(input), { code: 'IDEMPOTENCY_CONFLICT' })
  assert.equal(h.chatCalls(), 0)
})
