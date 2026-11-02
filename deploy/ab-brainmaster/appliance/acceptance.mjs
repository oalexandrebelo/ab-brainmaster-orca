import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, open, access } from 'node:fs/promises'
import { RuntimeClient } from '/opt/ab-release/ab-control/runtime-adapter.mjs'

const profile = '/var/lib/ab-brainmaster/profile'
const witnessPath = '/var/lib/ab-brainmaster/boot-witness.json'
const folderPath = '/workspaces/boot-acceptance'
assert.ok((await readFile('/proc/cmdline', 'utf8')).split(/\s+/).includes('ab.acceptance=1'))
await access('/var/lib/ab-brainmaster/.ab-acceptance-enabled')
const runtime = new RuntimeClient(profile, 15000, null, null)
async function until(read, timeout = 120000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try {
      const value = await read()
      if (value) {
        return value
      }
    } catch (error) {
      last = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw last ?? new Error('Appliance readiness timed out')
}
async function durableWrite(path, value) {
  const file = await open(path, 'w', 0o600)
  try {
    await file.writeFile(JSON.stringify(value))
    await file.sync()
  } finally {
    await file.close()
  }
}
try {
  const status = (await until(() => runtime.call('status.get'))).result
  let previous
  try {
    previous = JSON.parse(await readFile(witnessPath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  if (previous) {
    assert.equal(status.hostDescriptor.installationId, previous.installationId)
    assert.notEqual(status.runtimeId, previous.runtimeId)
    const folders = (await runtime.call('folderWorkspace.list')).result.folderWorkspaces
    assert.ok(folders.some((folder) => folder.id === previous.folderId))
    assert.equal(JSON.parse(await readFile(`${folderPath}/nonce.json`, 'utf8')), previous.nonce)
    console.log(`AB_APPLIANCE_SECOND_BOOT_PASS ${previous.installationId}`)
  } else {
    await mkdir(folderPath, { recursive: true })
    const group = (
      await runtime.call('projectGroup.create', {
        name: 'Appliance acceptance',
        parentPath: '/workspaces'
      })
    ).result.group
    const folder = (
      await runtime.call('folderWorkspace.create', {
        projectGroupId: group.id,
        folderPath,
        name: 'Persistent folder'
      })
    ).result.folderWorkspace
    const terminal = (
      await runtime.call('terminal.create', {
        worktree: `id:folder:${folder.id}`,
        cwd: folderPath,
        presentation: 'background'
      })
    ).result.terminal
    const nonce = randomBytes(16).toString('hex')
    try {
      await runtime.call('terminal.send', {
        terminal: terminal.handle,
        text: `node -e "console.log('AB_BOOT_' + '${nonce}')"`,
        enter: true
      })
      await until(
        async () =>
          JSON.stringify(
            (await runtime.call('terminal.read', { terminal: terminal.handle, limit: 100 })).result
              .terminal?.tail
          ).includes(`AB_BOOT_${nonce}`),
        30000
      )
    } finally {
      await runtime.call('terminal.close', { terminal: terminal.handle })
    }
    await durableWrite(`${folderPath}/nonce.json`, nonce)
    await durableWrite(witnessPath, {
      installationId: status.hostDescriptor.installationId,
      runtimeId: status.runtimeId,
      folderId: folder.id,
      nonce
    })
    console.log(`AB_APPLIANCE_FIRST_BOOT_PASS ${status.hostDescriptor.installationId}`)
  }
} catch {
  console.error('AB_APPLIANCE_ACCEPTANCE_FAILED')
  process.exitCode = 1
}
