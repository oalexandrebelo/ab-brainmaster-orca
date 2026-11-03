import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { spawnProcess } from '@orca/process-host'
import {
  createManifest,
  verifyRelease,
  MANIFEST
} from '../../../config/scripts/ab-release-manifest.mjs'
import {
  acquireServiceLease,
  activateRelease,
  currentRelease,
  reclaimServiceLease,
  stageRelease
} from '../../../config/scripts/ab-release-store.mjs'
import { startHost } from '../dist/host.mjs'
import { createCredential } from '../credentials.mjs'
import { ControlClient } from '../sdk.mjs'
import { RuntimeClient } from '../dist/runtime-adapter.mjs'
import { orcadRoot, repoRoot } from './runtime-fixture.mjs'

test(
  'real service lease refuses live owners and recovers after SIGKILL',
  { timeout: 30000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'ab-lease-real-'))
    const path = join(root, 'service.lock')
    let child, closed
    try {
      child = spawnProcess({
        program: process.execPath,
        args: [
          '--input-type=module',
          '-e',
          "const {acquireServiceLease}=await import(process.argv[1]);await acquireServiceLease(process.argv[2]);process.stdout.write('lease-ready\\n');process.stdin.resume()",
          pathToFileURL(join(repoRoot, 'config/scripts/ab-release-store.mjs')).href,
          root
        ],
        stdio: 'pipe'
      })
      let diagnostic = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk) => {
        diagnostic = (diagnostic + chunk).slice(-4000)
      })
      closed = new Promise((resolveClosed) =>
        child.once('close', (code, signal) => resolveClosed({ code, signal }))
      )
      await new Promise((ready, reject) => {
        const timer = setTimeout(() => reject(new Error('Lease child did not become ready')), 10000)
        let output = ''
        child.stdout.setEncoding('utf8')
        child.stdout.on('data', (chunk) => {
          output += chunk
          if (output.includes('lease-ready\n')) {
            clearTimeout(timer)
            ready()
          }
        })
        child.once('error', (error) => {
          clearTimeout(timer)
          reject(error)
        })
        child.once('exit', () => {
          clearTimeout(timer)
          reject(new Error(`Lease child exited before readiness: ${diagnostic}`))
        })
      })
      const original = await readFile(path, 'utf8')
      assert.equal(JSON.parse(original).pid, child.pid)
      await assert.rejects(acquireServiceLease(root), { code: 'EEXIST' })
      await assert.rejects(reclaimServiceLease(root), /owner is still alive/)
      assert.equal(await readFile(path, 'utf8'), original)
      child.kill('SIGKILL')
      const result = await closed
      if (process.platform !== 'win32') {
        assert.equal(result.signal, 'SIGKILL')
      }
      const recovery = await Promise.allSettled([
        reclaimServiceLease(root),
        reclaimServiceLease(root)
      ])
      assert.equal(recovery.filter((value) => value.status === 'fulfilled').length, 1)
      const recoveryFailure = recovery.find((value) => value.status === 'rejected').reason
      assert.ok(
        recoveryFailure.code === 'ENOENT' ||
          /Another release transaction/.test(recoveryFailure.message)
      )
      const release = await acquireServiceLease(root)
      assert.equal(JSON.parse(await readFile(path, 'utf8')).pid, process.pid)
      await release()
      await assert.rejects(readFile(path), { code: 'ENOENT' })
      await writeFile(path, '', { mode: 0o600 })
      await assert.rejects(reclaimServiceLease(root), SyntaxError)
      await assert.rejects(acquireServiceLease(root), { code: 'EEXIST' })
      assert.equal(await readFile(path, 'utf8'), '')
      t.diagnostic(
        'A real child held the exclusive lease; SIGKILL released the owner and concurrent reclamation serialized. Live and malformed leases were preserved. Power-loss durability remains an appliance boot gate.'
      )
    } finally {
      if (child?.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
      }
      if (closed) {
        await closed
      }
      await rm(root, { recursive: true, force: true })
    }
  }
)

test(
  'real releases: hash verification, atomic activation, running-service fence and rollback with profile retention',
  { timeout: 180000 },
  async (t) => {
    const temporary = await mkdtemp(join(tmpdir(), 'ab-release-real-'))
    const root = join(temporary, 'store')
    const profile = join(temporary, 'profile')
    const tokenFile = join(temporary, 'token')
    createCredential(tokenFile)
    let host
    try {
      const source = join(temporary, 'candidate')
      await mkdir(source)
      await cp(orcadRoot, join(source, 'orcad'), { recursive: true })
      const hash = (await readFile(join(source, 'orcad/.runtime-node'), 'utf8')).trim()
      await cp(
        join(orcadRoot, '../runtimes', `node-${hash}`),
        join(source, 'runtimes', `node-${hash}`),
        { recursive: true }
      )
      await cp(join(repoRoot, 'packages/ab-control/dist'), join(source, 'ab-control'), {
        recursive: true
      })
      const target = (await readFile(join(source, 'orcad/.server-target'), 'utf8')).trim()
      const first = await createManifest(source, { version: '0.1.0-acceptance.1', target })
      await assert.rejects(
        stageRelease({ root, source, digest: '0'.repeat(64) }),
        /digest mismatch/
      )
      await stageRelease({ root, source, digest: first.digest })
      assert.equal((await stageRelease({ root, source, digest: first.digest })).reused, true)
      await activateRelease({ root, digest: first.digest })
      host = await startHost({ releaseRoot: root, profile, tokenFile })
      const firstClient = new ControlClient({ url: host.url, tokenFile })
      const identity = (await firstClient.call('status')).result.hostDescriptor.installationId
      assert.equal(host.releaseId, first.digest)
      const runtime = new RuntimeClient(profile, 10000, null, null)
      const group = (
        await runtime.call('projectGroup.create', {
          name: 'Retained through rollback',
          parentPath: temporary
        })
      ).result.group
      const folder = (
        await runtime.call('folderWorkspace.create', {
          projectGroupId: group.id,
          folderPath: temporary,
          name: 'Persistent workspace'
        })
      ).result.folderWorkspace
      await assert.rejects(activateRelease({ root, digest: first.digest }), /Stop the supervised/)
      await host.stop()
      host = null
      await rm(join(source, MANIFEST))
      const second = await createManifest(source, { version: '0.1.0-acceptance.2', target })
      const interrupted = spawnProcess({
        program: process.execPath,
        args: [
          '--input-type=module',
          '-e',
          'const {stageRelease}=await import(process.argv[1]);await stageRelease({root:process.argv[2],source:process.argv[3],digest:process.argv[4]})',
          pathToFileURL(join(repoRoot, 'config/scripts/ab-release-store.mjs')).href,
          root,
          source,
          second.digest
        ],
        stdio: 'pipe'
      })
      interrupted.stdin.end()
      interrupted.stdout.resume()
      interrupted.stderr.resume()
      const interruptedExit = new Promise((resolveExit) => interrupted.once('exit', resolveExit))
      let sawWriteLock = false
      const deadline = Date.now() + 30000
      while (Date.now() < deadline && interrupted.exitCode === null) {
        const probe = new DatabaseSync(join(root, '.release-lock.sqlite'))
        try {
          probe.exec('BEGIN IMMEDIATE')
          probe.exec('ROLLBACK')
        } catch (error) {
          if (error.errcode === 5 || error.message.includes('database is locked')) {
            sawWriteLock = true
          } else {
            throw error
          }
        } finally {
          probe.close()
        }
        if (sawWriteLock) {
          interrupted.kill('SIGKILL')
          break
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 5))
      }
      if (!sawWriteLock) {
        interrupted.kill('SIGKILL')
      }
      await interruptedExit
      assert.ok(
        sawWriteLock,
        'The child must be interrupted while staging owns the real OS write lock'
      )
      assert.equal((await currentRelease(root)).active, first.digest)
      const concurrent = await Promise.allSettled([
        stageRelease({ root, source, digest: second.digest }),
        stageRelease({ root, source, digest: second.digest })
      ])
      assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1)
      assert.match(
        concurrent.find((result) => result.status === 'rejected').reason.message,
        /Another release transaction/
      )
      assert.equal((await currentRelease(root)).active, first.digest)
      assert.equal((await stageRelease({ root, source, digest: second.digest })).reused, true)
      await activateRelease({ root, digest: second.digest })
      host = await startHost({ releaseRoot: root, profile, tokenFile })
      assert.equal(host.releaseId, second.digest)
      assert.equal(
        (await new ControlClient({ url: host.url, tokenFile }).call('status')).result.hostDescriptor
          .installationId,
        identity
      )
      await host.stop()
      host = null
      const rolledBack = await activateRelease({ root, rollback: true })
      assert.equal(rolledBack.active, first.digest)
      assert.equal(rolledBack.previous, second.digest)
      assert.equal(rolledBack.generation, 3)
      host = await startHost({ releaseRoot: root, profile, tokenFile })
      const restored = new ControlClient({ url: host.url, tokenFile })
      assert.equal((await restored.call('status')).result.hostDescriptor.installationId, identity)
      assert.ok(
        (await restored.call('folders')).result.folderWorkspaces.some(
          (value) => value.id === folder.id
        )
      )
      await host.stop()
      host = null
      const oldState = await readFile(join(root, 'active.json'), 'utf8')
      await writeFile(join(root, 'slots', second.digest, 'orcad/orcad.js'), 'tampered')
      await assert.rejects(activateRelease({ root, digest: second.digest }), /SHA-256 mismatch/)
      assert.equal(await readFile(join(root, 'active.json'), 'utf8'), oldState)
      assert.equal((await currentRelease(root)).active, first.digest)
      await verifyRelease(join(root, 'slots', first.digest), first.digest)
      t.diagnostic(
        'Two real release slots were started and rolled back with profile retention. SIGKILL during staging released the OS lock; competing recovery transactions serialized. Tampering failed before activation.'
      )
    } finally {
      if (host) {
        await host.stop()
      }
      await rm(temporary, { recursive: true, force: true })
    }
  }
)
