import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createPackage, createPackageWithOptions } from '@electron/asar'
import { expect, it } from 'vitest'
import { stageDesktopFontNotices } from './ab-desktop-asset-notices.mjs'
import {
  collectCopiedDesktopDependencies,
  verifyPackagedDesktopOutputs,
  verifyPackagedDeclarativeBundles
} from './ab-desktop-notices.mjs'

const root = resolve(import.meta.dirname, '../..')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function copyInput(source, target) {
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target)
}

it('binds evidence to real unpacked ASAR bytes and rejects a changed payload', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ab-desktop-asar-proof-'))
  try {
    const input = join(directory, 'input')
    const resources = join(directory, 'resources')
    const path = 'out/renderer/addon-fit.js'
    const source = join(root, 'node_modules/@xterm/addon-fit/lib/addon-fit.js')
    await copyInput(source, join(input, path))
    await mkdir(resources)
    await createPackageWithOptions(input, join(resources, 'app.asar'), {
      unpack: '**/*.js'
    })
    const bytes = await readFile(source)
    const reports = [{ name: 'desktop-renderer', markers: [{ path, sha256: digest(bytes) }] }]
    expect(verifyPackagedDesktopOutputs(resources, reports)[0].outputs).toEqual([
      { path: `app.asar/${path}`, sha256: digest(bytes), bytes: bytes.length }
    ])
    await writeFile(join(resources, 'app.asar.unpacked', path), 'changed output\n')
    expect(() => verifyPackagedDesktopOutputs(resources, reports)).toThrow(
      'Packaged desktop output differs from build evidence'
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('includes only dependencies witnessed in the copied payload and verifies their bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ab-desktop-copy-proof-'))
  try {
    const input = join(directory, 'input')
    const resources = join(directory, 'resources')
    await copyInput(join(root, 'package.json'), join(input, 'package.json'))
    await mkdir(resources)
    await createPackage(input, join(resources, 'app.asar'))
    const copiedPath = 'node_modules/@xterm/addon-fit/lib/addon-fit.js'
    await copyInput(join(root, copiedPath), join(resources, copiedPath))
    const mappings = [
      { from: 'node_modules/@xterm/addon-fit', to: 'node_modules/@xterm/addon-fit' },
      { from: 'node_modules/@xterm/addon-serialize', to: 'node_modules/@xterm/addon-serialize' }
    ]
    const evidence = await collectCopiedDesktopDependencies(resources, mappings, 'x64')
    expect(evidence.records.map((record) => record.package)).toEqual(['@xterm/addon-fit'])
    expect(evidence.inputs).toHaveLength(1)
    await writeFile(join(resources, copiedPath), 'changed copied module\n')
    await expect(collectCopiedDesktopDependencies(resources, mappings, 'x64')).rejects.toThrow(
      'Copied desktop artifact differs from its license source'
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('derives generated plugin dependency evidence from matching real esbuild output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ab-desktop-generated-proof-'))
  try {
    const input = join(directory, 'input')
    const resources = join(directory, 'resources')
    for (const filename of [
      'orca-runtime.mjs',
      'orca-testing.mjs',
      'orca-test-hooks.mjs',
      'orca-test-register.mjs'
    ]) {
      const path = `resources/plugins/declarative/${filename}`
      await copyInput(join(root, path), join(input, path))
    }
    await mkdir(resources)
    await createPackageWithOptions(input, join(resources, 'app.asar'), { unpack: '**/*.mjs' })
    const evidence = await verifyPackagedDeclarativeBundles(resources)
    expect(evidence.outputs).toHaveLength(4)
    const contributing = evidence.sources.flatMap((source) =>
      source.metafiles.flatMap((metafile) =>
        Object.values(metafile.outputs).flatMap((output) =>
          Object.entries(output.inputs)
            .filter(([, usage]) => usage.bytesInOutput > 0)
            .map(([path]) => path)
        )
      )
    )
    expect(contributing.some((path) => path.includes('/sucrase/'))).toBe(true)
    expect(contributing.some((path) => path.includes('/zod/'))).toBe(true)
    await writeFile(
      join(resources, 'app.asar.unpacked/resources/plugins/declarative/orca-test-hooks.mjs'),
      'changed generated bundle\n'
    )
    await expect(verifyPackagedDeclarativeBundles(resources)).rejects.toThrow(
      'Packaged declarative bundle differs from generated evidence'
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('binds actual font bytes and original declarations to complete terms without changing the fonts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ab-desktop-font-proof-'))
  try {
    const input = join(directory, 'input')
    const resources = join(directory, 'resources')
    const notices = join(resources, 'notices')
    const font = 'out/renderer/assets/Geist.woff2'
    await copyInput(
      join(root, 'src/renderer/src/assets/fonts/Geist-Variable.woff2'),
      join(input, font)
    )
    await copyInput(
      join(root, 'node_modules/katex/dist/fonts/KaTeX_Main-Regular.ttf'),
      join(input, 'out/renderer/assets/KaTeX.ttf')
    )
    await mkdir(resources)
    await createPackageWithOptions(input, join(resources, 'app.asar'), { unpack: '**/*' })
    const evidence = await stageDesktopFontNotices(resources, notices)
    expect(evidence.groups.map((group) => group.id).sort()).toEqual(['geist', 'katex-fonts'])
    const katex = evidence.groups.find((group) => group.id === 'katex-fonts')
    expect(katex.fonts[0].embeddedNames['13']).toContain('SIL Open Font License, Version 1.1')
    for (const group of evidence.groups) {
      for (const license of group.licenses) {
        expect(digest(await readFile(join(notices, license.path)))).toBe(license.sha256)
      }
    }
    await writeFile(join(resources, 'app.asar.unpacked', font), 'changed font\n')
    await expect(stageDesktopFontNotices(resources, notices)).rejects.toThrow(
      'Packaged desktop font has no exact notice provenance'
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
