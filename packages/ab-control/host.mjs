#!/usr/bin/env node
import { runProcess, spawnProcess } from '@orca/process-host'
import { readFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createControlServer } from './server.mjs'
import { acquireServiceLease, currentRelease } from '../../config/scripts/ab-release-store.mjs'

export async function startHost({
  releaseRoot,
  profile,
  tokenFile,
  port = 0,
  runtimePort = 0,
  container = false,
  publishedPort,
  syncBootstrapFilesystem = false
}) {
  if (syncBootstrapFilesystem && process.platform !== 'linux') {
    throw new Error('Appliance bootstrap filesystem synchronization requires Linux')
  }
  releaseRoot = resolve(releaseRoot)
  profile = resolve(profile)
  await mkdir(profile, { recursive: true, mode: 0o700 })
  const releaseLease = await acquireServiceLease(releaseRoot)
  let child, control, stopping
  const stop = () =>
    (stopping ??= (async () => {
      try {
        if (control) {
          await control.close()
        }
        if (child && child.exitCode === null && child.signalCode === null) {
          await new Promise((resolveExit, reject) => {
            const timer = setTimeout(() => {
              child.kill('SIGKILL')
              reject(new Error('Runtime shutdown exceeded 15 seconds'))
            }, 15000)
            child.once('exit', () => {
              clearTimeout(timer)
              resolveExit()
            })
            child.kill('SIGTERM')
          })
        }
      } finally {
        await releaseLease()
      }
    })())
  try {
    const release = await currentRelease(releaseRoot)
    const slot = release.directory
    const hash = (await readFile(join(slot, 'orcad/.runtime-node'), 'utf8')).trim()
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error('Invalid Node runtime marker')
    }
    const node = join(
      slot,
      'runtimes',
      `node-${hash}`,
      process.platform === 'win32' ? 'node.exe' : 'bin/node'
    )
    child = spawnProcess({
      program: node,
      args: [
        join(slot, 'orcad/orcad.js'),
        '--port',
        String(runtimePort),
        '--bind',
        container ? '0.0.0.0' : '127.0.0.1',
        '--no-pairing',
        '--json'
      ],
      env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', ORCA_USER_DATA: profile },
      stdio: 'pipe'
    })
    const exited = new Promise((resolveExit) =>
      child.once('exit', (code, signal) => resolveExit({ code, signal }))
    )
    const assertRuntimeAlive = () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `Runtime exited before control readiness: ${JSON.stringify({ code: child.exitCode, signal: child.signalCode })}`
        )
      }
    }
    child.stdin.end()
    // Runtime diagnostics can contain terminal content or credentials; operators read the private profile log.
    child.stderr.resume()
    await new Promise((ready, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Runtime readiness exceeded 120 seconds')),
        120000
      )
      let pending = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        pending += chunk
        if (pending.length > 65536) {
          clearTimeout(timer)
          reject(new Error('Runtime readiness output exceeded its limit'))
          return
        }
        let newline
        while ((newline = pending.indexOf('\n')) !== -1) {
          const line = pending.slice(0, newline)
          pending = pending.slice(newline + 1)
          try {
            if (JSON.parse(line).type === 'orca_server_ready') {
              clearTimeout(timer)
              ready()
            }
          } catch {
            /* Ignore diagnostics. */
          }
        }
      })
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code, signal) => {
        clearTimeout(timer)
        reject(new Error(`Runtime exited before readiness: ${JSON.stringify({ code, signal })}`))
      })
    })
    if (syncBootstrapFilesystem) {
      const started = performance.now()
      const result = await runProcess({
        program: '/usr/bin/sync',
        args: ['--file-system', '--', profile],
        timeoutMs: 30000,
        maxOutputBytes: 4096
      })
      const { code, signal, timedOut, outputTruncated } = result
      if (code !== 0 || signal !== null || timedOut || outputTruncated) {
        throw new Error(
          `Bootstrap filesystem synchronization failed: ${JSON.stringify({ code, signal, timedOut, outputTruncated: !!outputTruncated })}`
        )
      }
      console.log(
        JSON.stringify({
          type: 'ab_bootstrap_filesystem_sync',
          elapsedMs: Math.round(performance.now() - started)
        })
      )
    }
    assertRuntimeAlive()
    control = await createControlServer({
      profile,
      tokenFile,
      port,
      host: container ? '0.0.0.0' : '127.0.0.1',
      container,
      publishedPort
    })
    assertRuntimeAlive()
    return { url: control.url, releaseId: release.active, stop, exited }
  } catch (error) {
    await stop()
    throw error
  }
}

export async function main() {
  const host = await startHost({
    releaseRoot: process.env.AB_RELEASE_ROOT,
    profile: process.env.AB_CONTROL_PROFILE,
    tokenFile: process.env.AB_CONTROL_TOKEN_FILE,
    port: Number(process.env.AB_CONTROL_PORT ?? 0),
    runtimePort: Number(process.env.AB_RUNTIME_PORT ?? 0),
    container: process.env.AB_CONTROL_CONTAINER === '1',
    publishedPort: Number(process.env.AB_CONTROL_PUBLISHED_PORT),
    syncBootstrapFilesystem: process.env.AB_APPLIANCE_SYNC_BOOTSTRAP === '1'
  })
  console.log(JSON.stringify({ type: 'ab_host_ready', url: host.url, releaseId: host.releaseId }))
  let requestedStop = false
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      requestedStop = true
      void host.stop().catch(() => {
        process.exitCode = 1
      })
    })
  }
  const result = await host.exited
  if (!requestedStop) {
    process.exitCode = result.code || 1
    await host.stop()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error(
      JSON.stringify({
        ok: false,
        error: 'Host startup failed; check the release, credentials and private runtime profile.'
      })
    )
    process.exitCode = 1
  })
}
