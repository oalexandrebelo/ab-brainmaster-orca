import { access, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  stageRelease,
  activateRelease,
  reclaimServiceLease,
  currentRelease
} from './ab-release-store.mjs'
import { createCredential } from './credentials.mjs'

const root = '/var/lib/ab-brainmaster/releases'
const tokenFile = '/var/lib/ab-brainmaster/control-token'
await mkdir(root, { recursive: true, mode: 0o700 })
try {
  await access(tokenFile)
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error
  }
  createCredential(tokenFile)
}
try {
  await access(join(root, 'active.json'))
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error
  }
  const digest = (await readFile('/opt/ab-release.sha256', 'utf8')).trim()
  await stageRelease({ root, source: '/opt/ab-release', digest })
  await activateRelease({ root, digest })
}
try {
  await reclaimServiceLease(root)
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error
  }
}
process.env.AB_RELEASE_ROOT = root
process.env.AB_CONTROL_TOKEN_FILE = tokenFile
process.env.AB_CONTROL_PROFILE = '/var/lib/ab-brainmaster/profile'
const release = await currentRelease(root)
const { main } = await import(pathToFileURL(join(release.directory, 'ab-control/host.mjs')).href)
await main()
