import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { cp, mkdir, readFile, rename, rm, open, lstat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { verifyRelease } from './ab-release-manifest.mjs'

async function locked(root, action) {
  await mkdir(root, { recursive: true, mode: 0o700 })
  if (!(await lstat(root)).isDirectory()) {
    throw new Error('Release store must be a directory')
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
    if (process.platform !== 'win32') {
      const directory = await open(root, 'r')
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    }
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
      await rename(temporary, destination)
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
    await verifyRelease(join(root, 'slots', selected), selected)
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
  return await locked(resolve(root), async () => {
    const path = join(root, 'service.lock')
    const token = randomBytes(16).toString('hex')
    await writeFile(
      path,
      JSON.stringify({ pid: process.pid, identity: await processIdentity(process.pid), token }),
      { flag: 'wx', mode: 0o600 }
    )
    return async () => {
      const current = JSON.parse(await readFile(path, 'utf8'))
      if (current.token !== token) {
        throw new Error('Service lease ownership changed')
      }
      await rm(path)
    }
  })
}

async function processIdentity(pid) {
  if (process.platform !== 'linux') {
    return null
  }
  const [stat, boot] = await Promise.all([
    readFile(`/proc/${pid}/stat`, 'utf8'),
    readFile('/proc/sys/kernel/random/boot_id', 'utf8')
  ])
  return `${boot.trim()}:${stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]}`
}

export async function reclaimServiceLease(root) {
  return await locked(resolve(root), async () => {
    const path = join(root, 'service.lock')
    const lease = JSON.parse(await readFile(path, 'utf8'))
    if (!Number.isSafeInteger(lease.pid) || lease.pid < 1) {
      throw new Error('Invalid service lease')
    }
    try {
      process.kill(lease.pid, 0)
      const identity = await processIdentity(lease.pid)
      if (!identity || !lease.identity || identity === lease.identity) {
        throw new Error('Service lease owner is still alive')
      }
    } catch (error) {
      if (!['ESRCH', 'ENOENT'].includes(error.code)) {
        throw error
      }
    }
    await rm(path)
    return { reclaimed: true }
  })
}
