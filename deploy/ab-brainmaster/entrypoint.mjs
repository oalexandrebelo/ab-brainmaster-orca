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

const startedAt = performance.now()
let previousPhaseAt = startedAt
function reportPhase(phase) {
  const now = performance.now()
  console.log(
    JSON.stringify({
      type: 'ab_boot_phase',
      phase,
      elapsedMs: Math.round(now - startedAt),
      sincePreviousPhaseMs: Math.round(now - previousPhaseAt)
    })
  )
  previousPhaseAt = now
}

const root = '/var/lib/ab-brainmaster/releases'
const tokenFile = '/var/lib/ab-brainmaster/control-token'
reportPhase('state_directory')
await mkdir(root, { recursive: true, mode: 0o700 })
reportPhase('control_credential')
try {
  await access(tokenFile)
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error
  }
  createCredential(tokenFile)
}
reportPhase('active_release_pointer')
try {
  await access(join(root, 'active.json'))
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error
  }
  reportPhase('release_digest')
  const digest = (await readFile('/opt/ab-release.sha256', 'utf8')).trim()
  reportPhase('release_stage')
  await stageRelease({ root, source: '/opt/ab-release', digest })
  reportPhase('release_activation')
  await activateRelease({ root, digest })
}
reportPhase('service_lease_recovery')
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
reportPhase('active_release_resolution')
const release = await currentRelease(root)
reportPhase('host_module_import')
const { main } = await import(pathToFileURL(join(release.directory, 'ab-control/host.mjs')).href)
reportPhase('host_start')
await main()
