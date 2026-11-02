#!/usr/bin/env node
import {
  stageRelease,
  activateRelease,
  currentRelease,
  reclaimServiceLease
} from './ab-release-store.mjs'

const [command, root, sourceOrDigest, digest] = process.argv.slice(2)
try {
  if (!root) {
    throw new Error(
      'Usage: stage ROOT SOURCE DIGEST | activate ROOT DIGEST | rollback ROOT | status ROOT | reclaim ROOT'
    )
  }
  let result
  if (command === 'stage' && sourceOrDigest && digest) {
    result = await stageRelease({ root, source: sourceOrDigest, digest })
  } else if (command === 'activate' && sourceOrDigest && !digest) {
    result = await activateRelease({ root, digest: sourceOrDigest })
  } else if (command === 'rollback' && !sourceOrDigest) {
    result = await activateRelease({ root, rollback: true })
  } else if (command === 'status' && !sourceOrDigest) {
    const release = await currentRelease(root)
    result = {
      active: release.active,
      previous: release.previous,
      version: release.manifest.version,
      target: release.manifest.target,
      generation: release.generation
    }
  } else if (command === 'reclaim' && !sourceOrDigest) {
    result = await reclaimServiceLease(root)
  } else {
    throw new Error('Unsupported release command or arguments')
  }
  console.log(JSON.stringify({ ok: true, result }))
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }))
  process.exitCode = 1
}
