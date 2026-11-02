#!/usr/bin/env node
import { cp, mkdir, readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { createManifest } from './ab-release-manifest.mjs'
import { stageReleaseNotices } from './ab-release-notices.mjs'

const root = resolve(import.meta.dirname, '../..')
const [destination, version] = process.argv.slice(2)
if (!destination || !version) {
  throw new Error('Usage: ab-release-package.mjs DESTINATION VERSION')
}
const output = resolve(destination)
await mkdir(output, { recursive: false })
await cp(join(root, 'out/orcad'), join(output, 'orcad'), { recursive: true })
const runtimeHash = (await readFile(join(output, 'orcad/.runtime-node'), 'utf8')).trim()
if (!/^[a-f0-9]{64}$/.test(runtimeHash)) {
  throw new Error('Invalid Node marker')
}
await cp(
  join(root, 'out/runtimes', `node-${runtimeHash}`),
  join(output, 'runtimes', `node-${runtimeHash}`),
  { recursive: true }
)
await cp(join(root, 'packages/ab-control/dist'), join(output, 'ab-control'), { recursive: true })
await cp(join(root, 'packages/ab-control/openapi.json'), join(output, 'ab-control/openapi.json'))
await cp(join(root, 'packages/ab-local-runtime/dist'), join(output, 'ab-local-runtime'), {
  recursive: true,
  filter: (path) => basename(path) !== 'metafile.json'
})
const target = (await readFile(join(output, 'orcad/.server-target'), 'utf8')).trim()
await stageReleaseNotices(output, target)
const result = await createManifest(output, { version, target })
console.log(
  JSON.stringify({
    directory: output,
    digest: result.digest,
    version,
    target,
    files: result.manifest.files.length
  })
)
