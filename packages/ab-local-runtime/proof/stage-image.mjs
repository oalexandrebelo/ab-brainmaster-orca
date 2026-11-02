import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../../..')
const assets = path.join(root, 'packages/ab-local-runtime/.proof-assets')
const stage = path.join(assets, 'stage')
await rm(stage, { recursive: true, force: true })
await mkdir(stage, { recursive: true })
const copy = (source, destination, filter) =>
  cp(path.join(root, source), path.join(stage, destination), {
    recursive: true,
    dereference: true,
    filter
  })
await copy('out/orcad', 'repo/out/orcad')
await copy('out/runtimes', 'repo/out/runtimes')
await copy('src/packages/process-host/dist', 'repo/src/packages/process-host/dist')
await copy('src/packages/process-host/package.json', 'repo/src/packages/process-host/package.json')
await copy('packages/ab-context-bridge', 'repo/packages/ab-context-bridge')
await copy(
  'packages/ab-local-runtime',
  'repo/packages/ab-local-runtime',
  (source) => !['.proof-assets', '.proof-output'].includes(path.basename(source))
)
await copy(
  'packages/ab-control/dist/runtime-adapter.mjs',
  'repo/packages/ab-control/dist/runtime-adapter.mjs'
)
await copy(
  'packages/ab-control/tests/runtime-fixture.mjs',
  'repo/packages/ab-control/tests/runtime-fixture.mjs'
)
for (const name of ['bbrainx', 'ollama', 'models']) {
  await cp(path.join(assets, name), path.join(stage, name), {
    recursive: true,
    dereference: true,
    filter: (source) => path.basename(source) !== '.git'
  })
}
await copy('packages/ab-local-runtime/proof/Dockerfile', 'Dockerfile')
process.stdout.write(`${stage}\n`)
