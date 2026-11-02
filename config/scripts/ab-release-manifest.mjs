import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

export const MANIFEST = 'ab-release-manifest.json'
const MAX_FILES = 20000
const MAX_BYTES = 2 * 1024 * 1024 * 1024
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function fileHash(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

export async function inventory(root) {
  root = resolve(root)
  const files = []
  let total = 0
  async function walk(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name)
      const local = relative(root, path).split(sep).join('/')
      if (local === MANIFEST) {
        continue
      }
      const stat = await lstat(path)
      if (stat.isSymbolicLink()) {
        throw new Error('Release trees cannot contain symbolic links')
      }
      if (stat.isDirectory()) {
        await walk(path)
      } else {
        if (!stat.isFile()) {
          throw new Error('Release trees must contain regular files')
        }
        total += stat.size
        if (total > MAX_BYTES || files.length >= MAX_FILES) {
          throw new Error('Release tree exceeds its limit')
        }
        files.push({
          path: local,
          bytes: stat.size,
          executable: Boolean(stat.mode & 0o111),
          sha256: await fileHash(path)
        })
      }
    }
  }
  if (!(await lstat(root)).isDirectory()) {
    throw new Error('Release root must be a directory')
  }
  await walk(root)
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}

export async function createManifest(root, { version, target }) {
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) {
    throw new Error('Invalid release version')
  }
  if (!/^(?:linux|darwin|win32)-(?:x64|arm64)(?:-glibc|-musl)?$/.test(target)) {
    throw new Error('Invalid release target')
  }
  const files = await inventory(root)
  for (const required of [
    'orcad/orcad.js',
    'orcad/orcad-server.js',
    'ab-control/cli.mjs',
    'ab-control/host.mjs'
  ]) {
    if (!files.some((file) => file.path === required)) {
      throw new Error(`Missing release entry ${required}`)
    }
  }
  const manifest = { format: 1, product: 'AB-BRAINMASTER-ORCA', version, target, files }
  const wire = `${JSON.stringify(manifest, null, 2)}\n`
  await writeFile(join(root, MANIFEST), wire, { flag: 'wx', mode: 0o644 })
  return { manifest, digest: sha256(wire) }
}

export async function verifyRelease(root, expectedDigest) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new Error('A trusted SHA-256 manifest digest is required')
  }
  const stat = await lstat(join(root, MANIFEST))
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) {
    throw new Error('Invalid manifest file')
  }
  const wire = await readFile(join(root, MANIFEST))
  if (sha256(wire) !== expectedDigest) {
    throw new Error('Release manifest digest mismatch')
  }
  const manifest = JSON.parse(wire)
  if (
    manifest.format !== 1 ||
    manifest.product !== 'AB-BRAINMASTER-ORCA' ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error('Invalid release manifest')
  }
  const files = await inventory(root)
  if (JSON.stringify(files) !== JSON.stringify(manifest.files)) {
    throw new Error('Release file inventory or SHA-256 mismatch')
  }
  return manifest
}
