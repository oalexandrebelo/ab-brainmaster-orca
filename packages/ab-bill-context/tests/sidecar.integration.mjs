import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { startSidecar } from '../runtime.mjs'
import { proxyEnvironment, AUDITED_BILI_VERSION } from '../contracts.mjs'

const biliEntry = process.env.AB_BILI_TEST_ENTRY
const exec = promisify(execFile)

test(
  'real pinned bili CLI, private proxy, health ownership and synthetic upstream',
  { skip: !biliEntry, timeout: 30000 },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ab-bili-contract-'))
    t.after(() => fs.rm(directory, { recursive: true, force: true }))
    const version = await exec(process.execPath, [biliEntry, '--version'], {
      env: proxyEnvironment(directory),
      timeout: 5000
    })
    assert.match(version.stdout, new RegExp(AUDITED_BILI_VERSION.replaceAll('.', '\\.')))
    const help = await exec(process.execPath, [biliEntry, '--help'], {
      env: proxyEnvironment(directory),
      timeout: 5000
    })
    assert.match(help.stdout, /--no-auto-update/u)
    let received,
      upstreamCalls = 0
    const upstream = http.createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) {
        body += chunk
      }
      received = { path: req.url, body: JSON.parse(body), key: req.headers['x-api-key'] }
      upstreamCalls++
      res.writeHead(200, { 'content-type': 'application/json' })
      const text = received.body.stop_sequences?.includes('</block>')
        ? '<block>yes</block>'
        : 'synthetic response; no inference'
      res.end(
        JSON.stringify({
          id: 'synthetic-message',
          type: 'message',
          role: 'assistant',
          model: 'synthetic-model',
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 20, output_tokens: 7 }
        })
      )
    })
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise((resolve) => upstream.close(resolve)))
    const upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`
    const sidecar = await startSidecar({
      nodePath: process.execPath,
      biliEntry,
      dataDirectory: directory,
      upstream: upstreamOrigin,
      contextWindow: 16000
    })
    t.after(() => sidecar.stop())
    assert.equal(sidecar.health.pid, sidecar.child.pid)
    assert.equal(sidecar.health.version, AUDITED_BILI_VERSION)
    assert.equal(sidecar.health.watchdog.armed, true)
    assert.equal(sidecar.health.watchdog.parentPid, process.pid)
    const config = JSON.parse(
      await fs.readFile(path.join(sidecar.runDirectory, 'proxy.json'), 'utf8')
    )
    assert.equal(config.autoModeForge.enabled, false)
    assert.equal(config.mitm.enabled, false)
    const response = await fetch(`${sidecar.origin}/bili/${upstreamOrigin}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': 'synthetic-not-a-credential',
        'x-acp-session': 'ab-bili-synthetic'
      },
      body: JSON.stringify({
        model: 'synthetic-model',
        max_tokens: 256,
        stream: false,
        messages: [{ role: 'user', content: 'State that this is a transport fixture.' }]
      }),
      signal: AbortSignal.timeout(10000)
    })
    const result = await response.json()
    assert.equal(response.status, 200, JSON.stringify(result))
    assert.equal(received.path, '/v1/messages')
    assert.equal(received.key, 'synthetic-not-a-credential')
    assert.ok(received.body.messages.length > 0)
    assert.ok(
      Array.isArray(received.body.tools),
      'The real proxy must inject its compression tools'
    )
    assert.match(JSON.stringify(result), /synthetic response/u)
    const beforeClassifier = upstreamCalls
    const classifier = await fetch(`${sidecar.origin}/bili/${upstreamOrigin}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'synthetic-model',
        max_tokens: 64,
        stream: false,
        stop_sequences: ['</block>'],
        system: 'Decide whether the operation must be blocked.',
        messages: [
          {
            role: 'user',
            content: `<transcript>${'Synthetic operation awaiting explicit permission. '.repeat(80)}</transcript>`
          }
        ]
      }),
      signal: AbortSignal.timeout(10000)
    })
    assert.equal(classifier.status, 200)
    assert.equal(
      (await classifier.json()).content[0].text,
      '<block>yes</block>',
      'The upstream block verdict must survive; never forge allow'
    )
    assert.equal(upstreamCalls, beforeClassifier + 1, 'Classifier must reach the upstream')
    await sidecar.stop()
    await assert.rejects(
      fetch(`${sidecar.origin}/__bili/health`, { signal: AbortSignal.timeout(500) })
    )
  }
)

test(
  'foreign health listener is refused without stopping it',
  { skip: !biliEntry, timeout: 20000 },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ab-bili-collision-'))
    t.after(() => fs.rm(directory, { recursive: true, force: true }))
    const foreign = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, version: AUDITED_BILI_VERSION, pid: process.pid }))
    })
    await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise((resolve) => foreign.close(resolve)))
    const port = foreign.address().port
    await assert.rejects(
      startSidecar(
        {
          nodePath: process.execPath,
          biliEntry,
          dataDirectory: directory,
          upstream: 'https://example.invalid',
          contextWindow: 16000
        },
        { port, timeoutMs: 3000 }
      ),
      /Porta ocupada|proxy saiu/u
    )
    assert.equal((await fetch(`http://127.0.0.1:${port}/__bili/health`)).status, 200)
  }
)
