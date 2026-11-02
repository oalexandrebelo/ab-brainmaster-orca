import {
  constants,
  openSync,
  fstatSync,
  readFileSync,
  closeSync,
  writeFileSync,
  renameSync,
  rmSync
} from 'node:fs'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { resolve } from 'node:path'
import { ControlError } from './contract.mjs'

export function readPrivateFile(path, maxBytes = 8192) {
  let fd
  try {
    fd = openSync(resolve(path), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const stat = fstatSync(fd)
    if (
      !stat.isFile() ||
      stat.size > maxBytes ||
      (process.platform !== 'win32' && stat.mode & 0o077)
    ) {
      throw new Error('permissions')
    }
    return readFileSync(fd, 'utf8').trim()
  } catch {
    throw new ControlError(
      'credential_unavailable',
      'A private credential file is missing or has unsafe permissions.',
      503
    )
  } finally {
    if (fd !== undefined) {
      closeSync(fd)
    }
  }
}

export function readToken(path) {
  const value = readPrivateFile(path, 128)
  if (!/^[A-Za-z0-9_-]{43,86}$/.test(value)) {
    throw new ControlError(
      'credential_unavailable',
      'The credential file must contain a generated token.',
      503
    )
  }
  return value
}

export function createCredential(path, { rotate = false } = {}) {
  const token = randomBytes(32).toString('base64url')
  const destination = resolve(path)
  if (!rotate) {
    writeFileSync(destination, `${token}\n`, { mode: 0o600, flag: 'wx' })
  } else {
    readToken(destination)
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`
    try {
      writeFileSync(temporary, `${token}\n`, { mode: 0o600, flag: 'wx' })
      renameSync(temporary, destination)
    } finally {
      rmSync(temporary, { force: true })
    }
  }
  return destination
}

export function tokenMatches(header, expected) {
  if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_-]{43,86}$/.test(header)) {
    return false
  }
  const supplied = Buffer.from(header.slice(7))
  const valid = Buffer.from(expected)
  return supplied.length === valid.length && timingSafeEqual(supplied, valid)
}
