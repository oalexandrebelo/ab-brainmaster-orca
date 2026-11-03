import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, Rollup } from 'vite'
import { writeReleaseBuildMetadata } from '../scripts/ab-release-build-metadata.mjs'

type ModuleUsage = { renderedLength: number }
type OutputEvidence = {
  inputs: Record<string, ModuleUsage>
  imports: { path: string; kind: 'import-statement' | 'dynamic-import' }[]
}
type WorkerEvidence = { fileName: string; sha256: string; output: OutputEvidence }

const root = fileURLToPath(new URL('../..', import.meta.url))
const digest = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex')

function sourcePath(id: string): string | null {
  const path = id.split('?', 1)[0]
  if (path.includes('\0') || !isAbsolute(path)) {
    return null
  }
  if (!existsSync(path)) {
    if (path.split(/[\\/]/).includes('node_modules')) {
      throw new Error(`Bundled dependency input is unavailable: ${id}`)
    }
    return null
  }
  return relative(root, path)
}

function chunkEvidence(chunk: Rollup.OutputChunk): OutputEvidence {
  const inputs: Record<string, ModuleUsage> = {}
  for (const [id, module] of Object.entries(chunk.modules)) {
    if (!(module.renderedLength > 0)) {
      continue
    }
    const path = sourcePath(id)
    if (path) {
      inputs[path] = {
        renderedLength: (inputs[path]?.renderedLength ?? 0) + module.renderedLength
      }
    }
  }
  return {
    inputs,
    imports: [
      ...chunk.imports.map((path) => ({ path, kind: 'import-statement' as const })),
      ...chunk.dynamicImports.map((path) => ({ path, kind: 'dynamic-import' as const }))
    ]
  }
}

export function createAbDesktopBuildProvenance(name: string): {
  plugin: Plugin
  workerPlugin: () => Plugin
} {
  const workers = new Map<string, WorkerEvidence>()
  return {
    workerPlugin: () => ({
      name: `ab-${name}-worker-provenance`,
      apply: 'build',
      generateBundle: {
        order: 'post',
        handler(_options, bundle) {
          for (const output of Object.values(bundle)) {
            if (output.type !== 'chunk') {
              continue
            }
            const sha256 = digest(output.code)
            workers.set(`${output.fileName}:${sha256}`, {
              fileName: output.fileName,
              sha256,
              output: chunkEvidence(output)
            })
          }
        }
      }
    }),
    plugin: {
      name: `ab-${name}-build-provenance`,
      apply: 'build',
      buildStart() {
        workers.clear()
      },
      writeBundle: {
        order: 'post',
        async handler(options, bundle) {
          if (!options.dir) {
            throw new Error('Desktop provenance requires an output directory')
          }
          const outputs: Record<string, OutputEvidence> = {}
          const markers: string[] = []
          for (const output of Object.values(bundle)) {
            if (output.fileName.endsWith('.map') || output.fileName.startsWith('.vite/')) {
              continue
            }
            const outputPath = join(options.dir, output.fileName)
            markers.push(outputPath)
            if (output.type === 'chunk') {
              outputs[relative(root, outputPath)] = chunkEvidence(output)
              continue
            }
            const worker = workers.get(`${output.fileName}:${digest(output.source)}`)
            if (worker) {
              outputs[relative(root, outputPath)] = worker.output
            }
          }
          if (!markers.length || !Object.keys(outputs).length) {
            throw new Error(`Desktop build emitted no provenance: ${name}`)
          }
          await writeReleaseBuildMetadata(
            name,
            [
              {
                x_provenance: {
                  bundler: 'rolldown',
                  selection: 'OutputChunk.modules with positive renderedLength',
                  lengthUnit: 'rendered characters',
                  workers: 'Included only when final asset name and SHA256 match emitted code'
                },
                outputs
              }
            ],
            markers.sort()
          )
        }
      }
    }
  }
}

export function createAbDesktopBuildProvenancePlugins(enabled: boolean): {
  main: Plugin[]
  preload: Plugin[]
  renderer: Plugin[]
  workers: () => Plugin[]
} {
  const main = createAbDesktopBuildProvenance('desktop-main')
  const preload = createAbDesktopBuildProvenance('desktop-preload')
  const renderer = createAbDesktopBuildProvenance('desktop-renderer')
  return {
    main: enabled ? [main.plugin] : [],
    preload: enabled ? [preload.plugin] : [],
    renderer: enabled ? [renderer.plugin] : [],
    workers: () => (enabled ? [renderer.workerPlugin()] : [])
  }
}
