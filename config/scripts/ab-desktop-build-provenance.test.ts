import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { expect, it } from 'vitest'
import { createAbDesktopBuildProvenance } from '../build-plugins/ab-desktop-build-provenance'

it('binds real renderer and worker modules to emitted files without including merely installed packages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ab-desktop-provenance-'))
  const name = `desktop-probe-${process.pid}`
  const report = resolve(`out/reports/ab-release-${name}.json`)
  const capture = createAbDesktopBuildProvenance(name)
  try {
    await writeFile(join(directory, 'index.html'), '<script type="module" src="/main.js"></script>')
    await writeFile(
      join(directory, 'main.js'),
      'import {FitAddon} from "@xterm/addon-fit";globalThis.addon=new FitAddon();globalThis.worker=new Worker(new URL("./worker.js",import.meta.url),{type:"module"});'
    )
    await writeFile(
      join(directory, 'worker.js'),
      'import {SerializeAddon} from "@xterm/addon-serialize";globalThis.serialized=new SerializeAddon();'
    )
    await build({
      configFile: false,
      root: directory,
      logLevel: 'silent',
      resolve: {
        alias: {
          '@xterm/addon-fit': resolve('node_modules/@xterm/addon-fit/lib/addon-fit.js'),
          '@xterm/addon-serialize': resolve(
            'node_modules/@xterm/addon-serialize/lib/addon-serialize.js'
          )
        }
      },
      plugins: [capture.plugin],
      worker: { format: 'es', plugins: () => [capture.workerPlugin()] },
      build: { outDir: join(directory, 'out'), minify: true }
    })
    const evidence = JSON.parse(await readFile(report, 'utf8'))
    const outputs: Record<string, { inputs: Record<string, { renderedLength: number }> }> =
      evidence.metafiles[0].outputs
    const inputs = Object.values(outputs).flatMap((output) => Object.keys(output.inputs))
    expect(inputs.some((path) => path.includes('@xterm/addon-fit/'))).toBe(true)
    expect(inputs.some((path) => path.includes('@xterm/addon-serialize/'))).toBe(true)
    expect(inputs.some((path) => path.endsWith('worker.js'))).toBe(true)
    expect(inputs.some((path) => path.includes('/mermaid/'))).toBe(false)
    expect(evidence.metafiles[0].x_provenance.bundler).toBe('rolldown')
    for (const marker of evidence.markers) {
      expect(
        createHash('sha256')
          .update(await readFile(resolve(marker.path)))
          .digest('hex')
      ).toBe(marker.sha256)
    }
  } finally {
    await rm(report, { force: true })
    await rm(directory, { recursive: true, force: true })
  }
})
