import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { stageDependencyNotices } from '../../config/scripts/ab-release-dependency-notices.mjs'
import { readPlist } from './ab-ios-signing.mjs'
import { metroNoticeProvenance } from './ab-ios-metro-provenance.mjs'

const mobileRoot = path.resolve(import.meta.dirname, '..')
const repositoryRoot = path.resolve(mobileRoot, '..')
export const NOTICES_DIRECTORY = 'ABThirdPartyNotices'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
const coverageLimits = [
  'JavaScript selection follows mapped emitted source references, not all installed npm packages and not a byte-size measurement.',
  'The four reported generated outputs are expanded only when referenced by the emitted source map; their current bytes must match both Metro source content and generator evidence.',
  'Native coverage is the real CocoaPods aggregate-target acknowledgement output, not a per-symbol audit of the linked executable or an independent audit of every pod licence declaration.',
  'Explicit generated font assets are covered by their hash-bound OFL texts. Other image/media assets are not independently audited beyond the mapped owning package or Orca source licence.',
  'PNG sources with empty Metro sourcesContent require one full-path checkout candidate; their local digest is recorded as not-in-source-map and does not establish equality with transformed assets copied into the app.',
  'Metro virtual prelude, polyfill, and router-context modules are listed separately; no file-backed owner is inferred for generated glue.',
  'Apple SDK/system frameworks are not redistributed by this notice directory. No claim of App Store legal or privacy approval is made.'
]

function fileRecords(directory, prefix = '') {
  const files = []
  for (const name of fs.readdirSync(path.join(directory, prefix)).sort()) {
    const relative = path.posix.join(prefix, name)
    const full = path.join(directory, relative)
    const stat = fs.lstatSync(full)
    if (stat.isSymbolicLink()) {
      throw new Error(`A notice resource must not be a symlink: ${relative}`)
    }
    if (stat.isDirectory()) {
      files.push(...fileRecords(directory, relative))
    } else if (stat.isFile() && relative !== 'manifest.json') {
      files.push({ path: relative, sha256: digest(fs.readFileSync(full)), bytes: stat.size })
    } else if (!stat.isFile()) {
      throw new Error(`Unsupported notice resource: ${relative}`)
    }
  }
  return files
}

function copiedFile(source, destination) {
  const bytes = fs.readFileSync(source)
  fs.copyFileSync(source, destination)
  return { path: path.basename(destination), sha256: digest(bytes), bytes: bytes.length }
}

function copyCocoaPodsAcknowledgements(notices, podsRoot, targetName) {
  if (!/^[A-Za-z0-9_-]+$/.test(targetName)) {
    throw new Error('Unexpected CocoaPods aggregate target name.')
  }
  const aggregate = `Pods-${targetName}`
  const base = path.join(
    podsRoot,
    'Target Support Files',
    aggregate,
    `${aggregate}-acknowledgements`
  )
  const plist = readPlist(fs.readFileSync(`${base}.plist`))
  const acknowledgements = (plist.PreferenceSpecifiers ?? []).filter(
    (entry) =>
      typeof entry.Title === 'string' &&
      typeof entry.FooterText === 'string' &&
      entry.Title !== 'Acknowledgements' &&
      entry.FooterText.trim().length > 0
  )
  if (!acknowledgements.length) {
    throw new Error('CocoaPods did not supply any target acknowledgement text.')
  }
  const lock = path.join(podsRoot, '..', 'Podfile.lock')
  if (
    digest(fs.readFileSync(lock)) !== digest(fs.readFileSync(path.join(podsRoot, 'Manifest.lock')))
  ) {
    throw new Error('The CocoaPods manifest does not match Podfile.lock.')
  }
  return {
    aggregateTarget: aggregate,
    acknowledgementTitles: acknowledgements.map((entry) => entry.Title).sort(),
    files: [
      copiedFile(`${base}.plist`, path.join(notices, 'CocoaPods-acknowledgements.plist')),
      copiedFile(`${base}.markdown`, path.join(notices, 'CocoaPods-acknowledgements.markdown')),
      copiedFile(lock, path.join(notices, 'CocoaPods-Podfile.lock'))
    ]
  }
}

export async function stageIosNotices({
  appPath,
  sourceMapPath,
  podsRoot,
  targetName,
  receiptPath
}) {
  if (fs.existsSync(path.join(appPath, '_CodeSignature'))) {
    throw new Error('Refusing to add notices to an app with an existing code signature.')
  }
  const mapBytes = fs.readFileSync(sourceMapPath)
  const graph = metroNoticeProvenance(JSON.parse(mapBytes), mobileRoot)
  const bundle = fs.readFileSync(path.join(appPath, 'main.jsbundle'))
  const notices = path.join(appPath, NOTICES_DIRECTORY)
  if (fs.existsSync(notices)) {
    throw new Error('The notice resource directory already exists; use a clean AB archive build.')
  }
  fs.mkdirSync(notices)
  const native = copyCocoaPodsAcknowledgements(notices, podsRoot, targetName)
  copiedFile(path.join(repositoryRoot, 'LICENSE'), path.join(notices, 'Orca-MIT.txt'))
  const packages = await stageDependencyNotices(notices, {
    sources: [
      { component: 'ios-metro-archive', metafiles: [graph.metafile], workingDirectory: mobileRoot }
    ],
    generatedNames: ['mobile-mermaid-page', 'mobile-terminal-webview', 'mobile-terminal-document'],
    copiedInputs: [],
    basis:
      'Metro/Hermes archive source-map references, expanded through hash-bound generated output reports; native texts are separately supplied by CocoaPods for the actual aggregate target'
  })
  if (!packages.length) {
    throw new Error('The iOS bundle produced no dependency licence inventory.')
  }
  json(path.join(notices, 'metro-provenance.json'), {
    format: 1,
    selection: graph.metafile.x_provenance,
    mappingReferences: graph.mappingReferences,
    sources: graph.sources,
    virtual: graph.virtual
  })
  fs.writeFileSync(
    path.join(notices, 'README.txt'),
    [
      'AB BRAINMASTER ORCA — third-party notices',
      '',
      'Orca-MIT.txt contains the upstream source licence. dependencies.json indexes the complete npm and explicit generated-asset licence texts and their hashes.',
      'CocoaPods-acknowledgements.markdown and .plist are copied from pod install for this application target. CocoaPods-Podfile.lock identifies the native resolution.',
      'manifest.json binds these resources to the exact main.jsbundle and records the source-map digest. metro-provenance.json records mapped sources without embedding the source map itself.',
      '',
      'Coverage limits:',
      ...coverageLimits.map((limit) => `- ${limit}`),
      ''
    ].join('\n')
  )
  const manifest = {
    format: 1,
    kind: 'ab-ios-third-party-notices',
    bundle: { path: 'main.jsbundle', sha256: digest(bundle), bytes: bundle.length },
    sourceMap: { sha256: digest(mapBytes), bytes: mapBytes.length },
    coverage: {
      npmPackages: packages.length,
      mappedSourceFiles: graph.sources.length,
      virtualModules: graph.virtual.length,
      native,
      limits: coverageLimits
    },
    files: fileRecords(notices)
  }
  json(path.join(notices, 'manifest.json'), manifest)
  const verified = verifyIosNotices(appPath)
  if (receiptPath) {
    json(receiptPath, verified)
  }
  return verified
}

export function verifyIosNotices(appPath, expectedManifestSha256) {
  const notices = path.join(appPath, NOTICES_DIRECTORY)
  const manifestBytes = fs.readFileSync(path.join(notices, 'manifest.json'))
  const manifestSha256 = digest(manifestBytes)
  if (expectedManifestSha256 && manifestSha256 !== expectedManifestSha256) {
    throw new Error('The archived notice manifest differs from the build-phase receipt.')
  }
  const manifest = JSON.parse(manifestBytes)
  if (
    manifest.format !== 1 ||
    manifest.kind !== 'ab-ios-third-party-notices' ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length
  ) {
    throw new Error('The application has no valid iOS notice manifest.')
  }
  const bundle = fs.readFileSync(path.join(appPath, 'main.jsbundle'))
  if (
    manifest.bundle?.path !== 'main.jsbundle' ||
    digest(bundle) !== manifest.bundle.sha256 ||
    bundle.length !== manifest.bundle.bytes
  ) {
    throw new Error('The packaged JavaScript bundle differs from its notice provenance.')
  }
  const actual = fileRecords(notices)
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) {
    throw new Error('The application notice resources are missing, changed, or unlisted.')
  }
  const indexed = new Map(actual.map((file) => [file.path, file.sha256]))
  for (const required of [
    'README.txt',
    'Orca-MIT.txt',
    'dependencies.json',
    'metro-provenance.json',
    'CocoaPods-acknowledgements.plist',
    'CocoaPods-acknowledgements.markdown',
    'CocoaPods-Podfile.lock'
  ]) {
    if (!indexed.has(required)) {
      throw new Error(`Required iOS notice resource is missing: ${required}`)
    }
  }
  const dependencies = JSON.parse(fs.readFileSync(path.join(notices, 'dependencies.json'), 'utf8'))
  for (const entry of dependencies.packages ?? []) {
    if (!entry.files?.length) {
      throw new Error(`The notice inventory contains a package without texts: ${entry.name}`)
    }
    for (const file of entry.files) {
      if (indexed.get(file.path) !== file.sha256) {
        throw new Error(`Dependency licence hash mismatch: ${file.path}`)
      }
    }
  }
  for (const asset of dependencies.assets ?? []) {
    if (indexed.get(asset.license.path) !== asset.license.sha256) {
      throw new Error(`Generated asset licence hash mismatch: ${asset.path}`)
    }
  }
  if (
    !dependencies.packages?.length ||
    dependencies.packages.length !== manifest.coverage?.npmPackages
  ) {
    throw new Error('The iOS package inventory count does not match the notice manifest.')
  }
  return {
    directory: NOTICES_DIRECTORY,
    manifestSha256,
    resourceFiles: actual.length,
    npmPackages: dependencies.packages.length,
    generatedOutputs: dependencies.generated,
    explicitAssets: dependencies.assets,
    nativeAcknowledgements: manifest.coverage.native.acknowledgementTitles.length,
    bundleSha256: manifest.bundle.sha256,
    sourceMapSha256: manifest.sourceMap.sha256,
    coverageLimits: manifest.coverage.limits
  }
}

async function fromXcode() {
  const required = [
    'CONFIGURATION',
    'CONFIGURATION_BUILD_DIR',
    'UNLOCALIZED_RESOURCES_FOLDER_PATH',
    'DERIVED_FILE_DIR',
    'PODS_ROOT',
    'TARGET_NAME'
  ]
  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`The iOS notice phase requires Xcode setting ${name}.`)
    }
  }
  if (process.env.CONFIGURATION !== 'Release') {
    throw new Error('The AB distribution notice phase requires a Release archive.')
  }
  const receipt = await stageIosNotices({
    appPath: path.join(
      process.env.CONFIGURATION_BUILD_DIR,
      process.env.UNLOCALIZED_RESOURCES_FOLDER_PATH
    ),
    sourceMapPath: path.join(process.env.DERIVED_FILE_DIR, 'ab-ios-main.jsbundle.map'),
    podsRoot: process.env.PODS_ROOT,
    targetName: process.env.TARGET_NAME,
    receiptPath:
      process.env.AB_IOS_NOTICE_RECEIPT ||
      path.join(process.env.DERIVED_FILE_DIR, 'ab-ios-notice-receipt.json')
  })
  console.log(
    `[ab-ios-notices] ${receipt.npmPackages} npm packages; ${receipt.nativeAcknowledgements} CocoaPods acknowledgements; ${receipt.resourceFiles} resources; manifest ${receipt.manifestSha256}`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  if (process.argv[2] !== 'from-xcode') {
    throw new Error(
      'Use the AB iOS Xcode archive workflow to generate notice resources before signing.'
    )
  }
  await fromXcode()
}
