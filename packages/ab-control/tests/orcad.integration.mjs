import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { runProcess } from '@orca/process-host'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { OrcaStdioTransport } from '../../ab-context-bridge/stdio-transport.mjs'
import { RuntimeClient } from '../dist/runtime-adapter.mjs'
import { createControlServer } from '../dist/server.mjs'
import { ControlClient } from '../sdk.mjs'
import { createCredential, readToken } from '../credentials.mjs'
import { startOrcad, repoRoot } from './runtime-fixture.mjs'

async function until(predicate, timeout = 10000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value) {
      return value
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Real runtime condition timed out')
}

test(
  'real orcad: pairing, folder PTY, reconnect, SDK/HTTP/CLI/MCP, admission, restart and revocation',
  { timeout: 180000 },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'ab-control-orcad-'))
    const profile = join(dir, 'profile')
    const folder = join(dir, 'folder-without-git')
    const tokenFile = join(dir, 'control-token')
    mkdirSync(profile)
    mkdirSync(folder)
    createCredential(tokenFile)
    let host, server, terminalHandle, local
    try {
      host = await startOrcad(profile)
      const pairing = host.ready.pairing?.url
      assert.ok(pairing)
      const port = Number(new URL(host.ready.advertisedEndpoint).port)
      local = new RuntimeClient(profile, 10000, null, null)
      let remote = new RuntimeClient(profile, 10000, pairing, null)
      const first = (await remote.call('status.get')).result
      assert.ok(first.runtimeId)
      assert.ok(first.hostDescriptor?.installationId)
      const group = (
        await local.call('projectGroup.create', { name: 'AB runtime integration', parentPath: dir })
      ).result.group
      const created = (
        await local.call('folderWorkspace.create', {
          projectGroupId: group.id,
          folderPath: folder,
          name: 'No Git required'
        })
      ).result.folderWorkspace
      assert.ok(created.id)
      const terminal = (
        await remote.call('terminal.create', {
          worktree: `id:folder:${created.id}`,
          cwd: folder,
          presentation: 'background'
        })
      ).result.terminal
      terminalHandle = terminal.handle
      assert.ok(terminalHandle)
      const nonce = randomBytes(16).toString('hex')
      await remote.call('terminal.send', {
        terminal: terminalHandle,
        text: `"${process.execPath}" -e "console.log('AB_REAL_' + '${nonce}')"`,
        enter: true
      })
      await until(async () => {
        const result = (
          await remote.call('terminal.read', { terminal: terminalHandle, limit: 100 })
        ).result
        return JSON.stringify(result.terminal?.tail).includes(`AB_REAL_${nonce}`)
      })
      t.diagnostic('Real pairing and PTY nonce verified in a folder workspace.')
      remote = new RuntimeClient(profile, 10000, pairing, null)
      assert.equal((await remote.call('status.get')).result.runtimeId, first.runtimeId)
      server = await createControlServer({ profile, tokenFile, maxInFlight: 1, timeoutMs: 8000 })
      const client = new ControlClient({ url: server.url, tokenFile })
      assert.equal((await client.call('status')).result.runtimeId, first.runtimeId)
      assert.ok(
        (await client.call('folders')).result.folderWorkspaces.some(
          (value) => value.id === created.id
        )
      )
      assert.ok((await client.call('terminal_read', { terminal: terminalHandle })).result.terminal)
      const request = (path, options = {}) =>
        fetch(`${server.url}${path}`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${readToken(tokenFile)}`,
            'content-type': 'application/json',
            ...options.headers
          },
          body: options.body ?? '{}',
          ...options.override
        })
      assert.equal(
        (await request('/v1/status', { headers: { authorization: 'Bearer invalid' } })).status,
        401
      )
      assert.equal(
        (await request('/v1/status', { headers: { origin: 'https://untrusted.example' } })).status,
        403
      )
      const wrongHostStatus = await new Promise((resolve, reject) => {
        const outgoing = httpRequest(
          `${server.url}/v1/status`,
          {
            method: 'POST',
            headers: {
              host: 'untrusted.example',
              authorization: `Bearer ${readToken(tokenFile)}`,
              'content-type': 'application/json'
            }
          },
          (incoming) => {
            incoming.resume()
            resolve(incoming.statusCode)
          }
        )
        outgoing.on('error', reject)
        outgoing.end('{}')
      })
      assert.equal(wrongHostStatus, 403)
      assert.equal((await request('/v1/rpc')).status, 404)
      assert.equal((await request('/v1/status', { body: '{' })).status, 400)
      assert.equal(
        (await request('/v1/status', { body: JSON.stringify({ oversized: 'x'.repeat(17000) }) }))
          .status,
        413
      )
      const waiting = client.call('terminal_wait', { terminal: terminalHandle, timeoutMs: 1200 })
      await until(() => server.inFlight === 1)
      assert.equal((await request('/v1/status')).status, 429)
      await assert.rejects(waiting, { code: 'timeout', status: 504 })
      assert.equal(server.inFlight, 0)
      const cancel = new AbortController()
      const canceled = client.call(
        'terminal_wait',
        { terminal: terminalHandle, timeoutMs: 500 },
        { signal: cancel.signal }
      )
      await until(() => server.inFlight === 1)
      cancel.abort()
      await assert.rejects(canceled, { name: 'AbortError' })
      assert.equal(server.inFlight, 1)
      await until(() => server.inFlight === 0)
      const beforeToken = readToken(tokenFile)
      createCredential(tokenFile, { rotate: true })
      assert.equal(
        (await request('/v1/status', { headers: { authorization: `Bearer ${beforeToken}` } }))
          .status,
        401
      )
      assert.equal((await client.call('status')).result.runtimeId, first.runtimeId)
      const environment = {
        ...process.env,
        AB_CONTROL_URL: server.url,
        AB_CONTROL_TOKEN_FILE: tokenFile
      }
      const cli = await runProcess({
        program: process.execPath,
        args: [join(repoRoot, 'packages/ab-control/dist/cli.mjs'), 'status'],
        env: environment,
        timeoutMs: 15000
      })
      assert.equal(cli.code, 0, cli.stderr)
      assert.equal(JSON.parse(cli.stdout).result.runtimeId, first.runtimeId)
      const transport = new OrcaStdioTransport({
        program: process.execPath,
        args: [join(repoRoot, 'packages/ab-control/dist/mcp.mjs')],
        env: environment
      })
      const mcp = new Client({ name: 'ab-runtime-acceptance', version: '1' })
      try {
        await mcp.connect(transport)
        assert.equal((await mcp.listTools()).tools.length, 7)
        const answer = await mcp.callTool({ name: 'status', arguments: {} })
        assert.equal(answer.isError, undefined)
        assert.equal(JSON.parse(answer.content[0].text).result.runtimeId, first.runtimeId)
      } finally {
        await mcp.close()
        await transport.close()
      }
      t.diagnostic(
        'HTTP/SDK/CLI/MCP parity; Origin/Host/body/auth validation; concurrency and cancellation verified.'
      )
      await host.stop()
      await assert.rejects(remote.call('status.get'))
      host = await startOrcad(profile, { port })
      const restored = (await remote.call('status.get')).result
      assert.notEqual(restored.runtimeId, first.runtimeId)
      assert.equal(restored.hostDescriptor.installationId, first.hostDescriptor.installationId)
      assert.ok(
        (await client.call('folders')).result.folderWorkspaces.some(
          (value) => value.id === created.id
        )
      )
      const retained = (
        await remote.call('terminal.read', { terminal: terminalHandle, limit: 100 })
      ).result
      assert.ok(JSON.stringify(retained.terminal?.tail).includes(`AB_REAL_${nonce}`))
      const registry = join(profile, 'orca-devices.json')
      const devices = JSON.parse(readFileSync(registry, 'utf8'))
      const oldOffer = JSON.parse(
        Buffer.from(new URL(pairing).searchParams.get('code'), 'base64url').toString('utf8')
      )
      const revoked = devices.find((value) => value.token === oldOffer.deviceToken)
      assert.ok(revoked, 'Pairing credential must exist in the real registry')
      const temporary = `${registry}.revocation`
      writeFileSync(
        temporary,
        JSON.stringify(devices.filter((value) => value.deviceId !== revoked.deviceId)),
        { mode: 0o600 }
      )
      renameSync(temporary, registry)
      await assert.rejects(remote.call('status.get'))
      assert.ok((await local.call('status.get')).result.runtimeId)
      t.diagnostic(
        'Restart restores profile identity, folder and PTY output; original device token is revoked on next connection.'
      )
    } finally {
      if (terminalHandle && local) {
        await local.call('terminal.close', { terminal: terminalHandle }).catch(() => {})
      }
      if (server) {
        await server.close()
      }
      if (host) {
        await host.stop()
      }
      rmSync(dir, { recursive: true, force: true })
    }
  }
)
