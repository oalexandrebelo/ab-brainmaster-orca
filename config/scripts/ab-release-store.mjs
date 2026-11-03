import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { cp, mkdir, readFile, readdir, rename, rm, open, lstat, link } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { verifyRelease } from './ab-release-manifest.mjs'

async function syncDirectory(path) {
  if (process.platform === 'win32') {
    return
  }
  const directory = await open(path, 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}

async function syncReleaseTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await syncReleaseTree(path)
    } else if (entry.isFile()) {
      const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
      try {
        if (!(await file.stat()).isFile()) {
          throw new Error('Release trees must contain regular files')
        }
        await file.sync()
      } finally {
        await file.close()
      }
    } else {
      throw new Error('Release trees cannot contain symbolic links or special files')
    }
  }
  await syncDirectory(directory)
}

async function locked(root, action) {
  const created = await mkdir(root, { recursive: true, mode: 0o700 })
  if (!(await lstat(root)).isDirectory()) {
    throw new Error('Release store must be a directory')
  }
  if (created) {
    for (let directory = root; ; directory = dirname(directory)) {
      await syncDirectory(directory)
      if (directory === dirname(created)) {
        break
      }
    }
  }
  const database = new DatabaseSync(join(root, '.release-lock.sqlite'))
  try {
    try {
      database.exec('BEGIN IMMEDIATE')
    } catch (error) {
      if (error.errcode === 5 || error.message.includes('database is locked')) {
        throw new Error('Another release transaction is active')
      }
      throw error
    }
    try {
      return await action()
    } finally {
      database.exec('ROLLBACK')
    }
  } finally {
    database.close()
  }
}

async function readState(root) {
  try {
    const state = JSON.parse(await readFile(join(root, 'active.json'), 'utf8'))
    if (
      state.format !== 1 ||
      !/^[a-f0-9]{64}$/.test(state.active) ||
      (state.previous !== null && !/^[a-f0-9]{64}$/.test(state.previous)) ||
      !Number.isSafeInteger(state.generation)
    ) {
      throw new Error('Invalid activation state')
    }
    return state
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function atomicState(root, state) {
  const temporary = join(root, `.active-${randomBytes(8).toString('hex')}.tmp`)
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(`${JSON.stringify(state)}\n`)
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, join(root, 'active.json'))
    await syncDirectory(root)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function stageRelease({ root, source, digest }) {
  root = resolve(root)
  source = resolve(source)
  if (root === source || root.startsWith(`${source}${sep}`) || source.startsWith(`${root}${sep}`)) {
    throw new Error('Release source and store must be separate directory trees')
  }
  await verifyRelease(source, digest)
  return await locked(root, async () => {
    const slots = join(root, 'slots')
    await mkdir(slots, { recursive: true })
    const destination = join(slots, digest)
    try {
      await lstat(destination)
      await verifyRelease(destination, digest)
      await syncReleaseTree(destination)
      await syncDirectory(slots)
      await syncDirectory(root)
      return { digest, directory: destination, reused: true }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    const temporary = join(slots, `.stage-${randomBytes(8).toString('hex')}`)
    try {
      await cp(source, temporary, {
        recursive: true,
        dereference: false,
        errorOnExist: true,
        force: false
      })
      await verifyRelease(temporary, digest)
      await syncReleaseTree(temporary)
      await rename(temporary, destination)
      await syncDirectory(slots)
      await syncDirectory(root)
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
    return { digest, directory: destination, reused: false }
  })
}

async function requireStopped(root) {
  try {
    await lstat(join(root, 'service.lock'))
    throw new Error('Stop the supervised service before changing the active release')
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

export async function activateRelease({ root, digest, rollback = false }) {
  root = resolve(root)
  return await locked(root, async () => {
    await requireStopped(root)
    const previous = await readState(root)
    const selected = rollback ? previous?.previous : digest
    if (!selected) {
      throw new Error('There is no previous release to restore')
    }
    const slots = join(root, 'slots')
    const directory = join(slots, selected)
    await verifyRelease(directory, selected)
    await syncReleaseTree(directory)
    await syncDirectory(slots)
    await syncDirectory(root)
    if (previous?.active === selected) {
      return previous
    }
    const state = {
      format: 1,
      active: selected,
      previous: previous?.active ?? null,
      generation: (previous?.generation ?? 0) + 1,
      activatedAt: new Date().toISOString()
    }
    await atomicState(root, state)
    return state
  })
}

export async function currentRelease(root) {
  const state = await readState(root)
  if (!state) {
    throw new Error('No release is active')
  }
  const directory = join(resolve(root), 'slots', state.active)
  const manifest = await verifyRelease(directory, state.active)
  return { ...state, directory, manifest }
}

export async function acquireServiceLease(root) {
  root = resolve(root)
  return await locked(root, async () => {
    const path = join(root, 'service.lock')
    const token = randomBytes(16).toString('hex')
    const temporary = join(root, `.service-${randomBytes(8).toString('hex')}.tmp`)
    let created = false
    try {
      const file = await open(temporary, 'wx', 0o600)
      created = true
      try {
        await file.writeFile(
          JSON.stringify({ pid: process.pid, identity: await processIdentity(process.pid), token })
        )
        await file.sync()
      } finally {
        await file.close()
      }
      await link(temporary, path)
      await syncDirectory(root)
    } finally {
      if (created) {
        await rm(temporary, { force: true })
        await syncDirectory(root)
      }
    }
    return async () =>
      await locked(root, async () => {
        const current = JSON.parse(await readFile(path, 'utf8'))
        if (current.token !== token) {
          throw new Error('Service lease ownership changed')
        }
        await rm(path)
        await syncDirectory(root)
      })
  })
}

const LINUX_BOOT_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const LINUX_EMPTY_BOOT_ID = '00000000-0000-0000-0000-000000000000'
const LINUX_PROCESS_IDENTITY = /^([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}):(0|[1-9][0-9]*)$/

async function linuxBootIdentity() {
  const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
  if (!LINUX_BOOT_ID.test(boot) || boot === LINUX_EMPTY_BOOT_ID) {
    throw new Error('Cannot prove the current Linux boot identity')
  }
  return boot
}

async function processIdentity(pid, boot = null) {
  if (process.platform !== 'linux') {
    return null
  }
  boot ??= await linuxBootIdentity()
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
  const ticks = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  if (stat.lastIndexOf(')') === -1 || !/^(0|[1-9][0-9]*)$/.test(ticks ?? '')) {
    throw new Error('Cannot prove the Linux process identity')
  }
  return `${boot}:${ticks}`
}

export async function reclaimServiceLease(root) {
  root = resolve(root)
  return await locked(root, async () => {
    const path = join(root, 'service.lock')
    const lease = JSON.parse(await readFile(path, 'utf8'))
    if (!Number.isSafeInteger(lease.pid) || lease.pid < 1) {
      throw new Error('Invalid service lease')
    }
    const boot = process.platform === 'linux' ? await linuxBootIdentity() : null
    const parsed =
      typeof lease.identity === 'string' ? LINUX_PROCESS_IDENTITY.exec(lease.identity) : null
    const recorded = parsed?.[1] === LINUX_EMPTY_BOOT_ID ? null : parsed
    if (!boot || !recorded || recorded[1] === boot) {
      let identity = null
      try {
        identity = await processIdentity(lease.pid, boot)
      } catch (error) {
        if (!['ESRCH', 'ENOENT', 'EACCES', 'EPERM'].includes(error.code)) {
          throw error
        }
      }
      try {
        process.kill(lease.pid, 0)
        if (!identity || (boot && !recorded) || identity === lease.identity) {
          throw new Error('Service lease owner is still alive')
        }
      } catch (error) {
        if (error.code !== 'ESRCH') {
          throw error
        }
      }
    }
    await rm(path)
    await syncDirectory(root)
    return { reclaimed: true }
  })
}
