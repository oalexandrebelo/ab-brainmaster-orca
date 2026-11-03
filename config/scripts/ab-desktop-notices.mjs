import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { extractFile, listPackage } from '@electron/asar'
import { stageDependencyNotices } from './ab-release-dependency-notices.mjs'
import { stagePinnedNodeNotice } from './ab-release-notices.mjs'
import { assertMobileWebBundleBuilt } from './verify-packaged-mobile-web-bundle.cjs'
import { bundleDeclarativeFiles } from './build-plugin-declarative-runtime.mjs'
import { stageAbSherpaNativeNotices } from './ab-sherpa-addon.mjs'
import { stageDesktopFontNotices } from './ab-desktop-asset-notices.mjs'

const root = resolve(import.meta.dirname, '../..')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const portable = (path) => path.split(sep).join('/')
const desktopReports = ['desktop-main', 'desktop-preload', 'desktop-renderer']

export async function verifyDesktopBuildMetadata(names = desktopReports) {
  const reports = []
  for (const name of names) {
    const report = JSON.parse(
      await readFile(join(root, `out/reports/ab-release-${name}.json`), 'utf8')
    )
    if (report.format !== 1 || !report.metafiles?.length || !report.markers?.length) {
      throw new Error(`Desktop provenance is missing: ${name}; rebuild the AB host`)
    }
    if (
      !report.metafiles.some((metafile) =>
        Object.values(metafile.outputs).some((output) =>
          Object.values(output.inputs).some(
            (usage) => (usage.bytesInOutput ?? usage.renderedLength) > 0
          )
        )
      )
    ) {
      throw new Error(`Desktop provenance has no emitted modules: ${name}`)
    }
    for (const marker of report.markers) {
      if (digest(await readFile(resolve(root, marker.path))) !== marker.sha256) {
        throw new Error(`Desktop provenance is stale: ${marker.path}; rebuild the AB host`)
      }
    }
    reports.push({ name, ...report })
  }
  return reports
}

export function verifyPackagedDesktopOutputs(resources, reports) {
  const archive = join(resources, 'app.asar')
  return reports.map(({ name, markers }) => ({
    component: name,
    outputs: markers.map((marker) => {
      const path = portable(marker.path)
      if (!/^out\/(?:main|preload|renderer|mobile-web)\//.test(path) || path.includes('/../')) {
        throw new Error(`Unexpected desktop output path: ${path}`)
      }
      const bytes = extractFile(archive, path)
      if (digest(bytes) !== marker.sha256) {
        throw new Error(`Packaged desktop output differs from build evidence: ${path}`)
      }
      return { path: `app.asar/${path}`, sha256: marker.sha256, bytes: bytes.length }
    })
  }))
}

export async function verifyPackagedDeclarativeBundles(resources) {
  const archive = join(resources, 'app.asar')
  const sources = []
  const outputs = []
  for (const { output, text, metafile } of await bundleDeclarativeFiles()) {
    const path = portable(relative(root, output))
    const sha256 = digest(text)
    if (
      digest(await readFile(output)) !== sha256 ||
      digest(extractFile(archive, path)) !== sha256
    ) {
      throw new Error(`Packaged declarative bundle differs from generated evidence: ${path}`)
    }
    sources.push({
      component: `desktop-generated:${path}`,
      metafiles: [metafile],
      workingDirectory: root
    })
    outputs.push({ path: `app.asar/${path}`, sha256, bytes: Buffer.byteLength(text) })
  }
  return { sources, outputs }
}

async function existing(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function witness(source, destination) {
  const target = await existing(destination)
  if (!target || !(await existing(source))) {
    return null
  }
  if (target.isFile()) {
    const bytes = await readFile(destination)
    if (digest(await readFile(source)) !== digest(bytes)) {
      throw new Error(`Copied desktop artifact differs from its license source: ${destination}`)
    }
    return { source, destination, sha256: digest(bytes), bytes: bytes.length }
  }
  if (!target.isDirectory()) {
    throw new Error(`Unsupported copied desktop artifact: ${destination}`)
  }
  const names = (await readdir(destination)).sort((left, right) => {
    const priority = (value) => (/\.(?:[cm]?js|node)$/.test(value) ? 0 : 1)
    return priority(left) - priority(right) || left.localeCompare(right, 'en')
  })
  for (const name of names) {
    const found = await witness(join(source, name), join(destination, name))
    if (found) {
      return found
    }
  }
  return null
}

async function owningPackage(input) {
  let directory = dirname(await realpath(input))
  while (directory !== dirname(directory)) {
    const path = join(directory, 'package.json')
    if (await existing(path)) {
      const metadata = JSON.parse(await readFile(path, 'utf8'))
      if (metadata.name && metadata.version) {
        return { directory, path, metadata }
      }
    }
    directory = dirname(directory)
  }
  throw new Error(`Copied desktop dependency has no package metadata: ${input}`)
}

export async function collectCopiedDesktopDependencies(resourcesDirectory, mappings, architecture) {
  const records = []
  const inputs = []
  const firstParty = []
  for (const mapping of mappings) {
    if (typeof mapping !== 'object' || !mapping.from || !mapping.to) {
      continue
    }
    const expand = (path) => path.replaceAll('${arch}', architecture)
    const source = resolve(root, expand(mapping.from))
    const destination = resolve(resourcesDirectory, expand(mapping.to))
    const withinResources = relative(resourcesDirectory, destination)
    if (withinResources.startsWith('..') || isAbsolute(withinResources)) {
      throw new Error(`Desktop resource escapes its payload: ${mapping.to}`)
    }
    if (
      !source.split(/[\\/]/).includes('node_modules') &&
      !withinResources.split(/[\\/]/).includes('node_modules')
    ) {
      continue
    }
    const proof = await witness(source, destination)
    if (!proof) {
      continue
    }
    const selected = await owningPackage(proof.source)
    const record = {
      package: selected.metadata.name,
      version: selected.metadata.version,
      path: portable(relative(resourcesDirectory, proof.destination)),
      sha256: proof.sha256,
      bytes: proof.bytes
    }
    const sourceRelative = portable(relative(root, selected.directory))
    if (
      selected.metadata.private === true &&
      (sourceRelative.startsWith('src/packages/') || sourceRelative.startsWith('packages/'))
    ) {
      firstParty.push({ ...record, license: 'Orca-MIT.txt' })
    } else {
      inputs.push({ path: proof.source, component: `desktop-copied:${record.path}` })
      records.push(record)
    }
  }
  const archive = join(resourcesDirectory, 'app.asar')
  for (const member of listPackage(archive)) {
    const normalized = member.replaceAll('\\', '/').replace(/^\//, '')
    if (!normalized.startsWith('node_modules/') || !normalized.endsWith('/package.json')) {
      continue
    }
    const bytes = extractFile(archive, member)
    const metadata = JSON.parse(bytes.toString())
    if (!metadata.name || !metadata.version) {
      continue
    }
    const source = resolve(root, normalized)
    const selected = JSON.parse(await readFile(source, 'utf8'))
    if (selected.name !== metadata.name || selected.version !== metadata.version) {
      throw new Error(`Packaged ASAR dependency does not match its license source: ${member}`)
    }
    inputs.push({ path: source, component: `desktop-asar:${normalized}` })
    records.push({
      package: metadata.name,
      version: metadata.version,
      path: `app.asar/${normalized}`,
      sha256: digest(bytes),
      bytes: bytes.length
    })
  }
  return { inputs, records, firstParty }
}

export async function stageDesktopRuntimeLicenses(appOutDir, notices) {
  const licenses = []
  await mkdir(notices, { recursive: true })
  for (const [source, path] of [
    ['LICENSE.electron.txt', 'Electron-LICENSE.txt'],
    ['LICENSES.chromium.html', 'LICENSES.chromium.html']
  ]) {
    const bytes = await readFile(join(appOutDir, source))
    await writeFile(join(notices, path), bytes)
    licenses.push({ path, source, bytes: bytes.length, sha256: digest(bytes) })
  }
  return licenses
}

export async function stageDesktopNotices(context, resourceMappings) {
  const architecture = { 1: 'x64', 3: 'arm64' }[context.arch]
  if (context.electronPlatformName !== 'linux' || !architecture) {
    throw new Error('AB desktop notices currently require a Linux x64/arm64 directory payload')
  }
  const resources = join(context.appOutDir, 'resources')
  const reports = await verifyDesktopBuildMetadata([...desktopReports, 'mobile-web'])
  const bundledOutputs = verifyPackagedDesktopOutputs(resources, reports)
  assertMobileWebBundleBuilt(join(resources, 'app.asar.unpacked/out/mobile-web'))
  const declarative = await verifyPackagedDeclarativeBundles(resources)
  const copied = await collectCopiedDesktopDependencies(resources, resourceMappings, architecture)
  const notices = join(resources, 'notices/ab-desktop')
  await rm(notices, { recursive: true, force: true })
  await mkdir(notices, { recursive: true })
  await cp(join(root, 'LICENSE'), join(notices, 'Orca-MIT.txt'))
  const native = await stageAbSherpaNativeNotices(context, notices)
  const fonts = await stageDesktopFontNotices(resources, notices)
  const packages = await stageDependencyNotices(notices, {
    sources: [
      ...desktopReports.map((name) => ({ component: name, report: name, workingDirectory: root })),
      {
        component: 'desktop-mobile-web',
        report: 'mobile-web',
        workingDirectory: join(root, 'mobile')
      },
      ...declarative.sources
    ],
    copiedInputs: copied.inputs,
    basis:
      'Rolldown modules with positive renderedLength and hash-matched emitted workers; esbuild mobile-web output contributions; hash-bound generated assets; runtime artifacts witnessed in the final desktop payload'
  })
  await stagePinnedNodeNotice(notices, `linux-${architecture}-glibc`)
  const runtimeLicenses = await stageDesktopRuntimeLicenses(context.appOutDir, notices)
  const provenance = {
    format: 1,
    target: `linux-${architecture}-dir`,
    bundledOutputs,
    generatedOutputs: declarative.outputs,
    copiedArtifacts: copied.records,
    firstParty: copied.firstParty,
    runtimeLicenses,
    native,
    fonts,
    dependencyPackages: packages.length
  }
  await writeFile(
    join(notices, 'desktop-provenance.json'),
    `${JSON.stringify(provenance, null, 2)}\n`
  )
  await writeFile(
    join(notices, 'DISTRIBUTION.txt'),
    'AB-BRAINMASTER-ORCA desktop distribution notices\n\nOrca core: MIT, Lovecast Inc.; complete text in Orca-MIT.txt.\nBundled and copied dependency terms: dependencies.json records supplied texts, hashes, origins and version-specific provenance differences.\nThe lazy-val1.0.5 entry preserves its original publisher declaration and a separately identified standard MIT text; no publisher-supplied LICENSE was available.\nDesktop source evidence: desktop-provenance.json binds rendered bundles and copied payload witnesses.\nFont bytes, original embedded declarations and complete supplied terms are indexed in assets/provenance.json.\nThe rebuilt speech addon, unchanged SDK libraries and complete ONNX notices are indexed in native/provenance.json.\nElectron and Chromium: complete license texts are included here and at the application root.\nThe separately bundled pinned Node runtime license is in Node-LICENSE.txt.\nThis development directory is not a signed installer.\n'
  )
  return provenance
}
