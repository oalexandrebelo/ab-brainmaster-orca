import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runProcess } from '@orca/process-host'
import { x as extractTar } from 'tar'
import { getSpeechModelDownloadMetadata } from '../../src/main/speech/model-download-catalog.ts'
import {
  NODE_RUNTIME_PIN,
  nodeRuntimeAsset,
  nodeRuntimeReleaseUrl
} from '../../src/shared/node-runtime-pin.ts'
import { fetchPinnedFile, pinnedNodeCacheDir } from './pinned-node-downloads.mjs'
import { verifyLinuxGlibcFloor } from './verify-linux-glibc-floor.cjs'
import { isDirectInvocation } from './script-entry-detection.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const pinPath = join(root, 'config/ab-sherpa-addon-pin.json')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hashFile = async (path) => digest(await readFile(path))
const outputRoot = join(root, 'out/ab-sherpa')
const addonFilename = 'sherpa-onnx.node'

async function configuration(arch) {
  const pin = JSON.parse(await readFile(pinPath, 'utf8'))
  const target = pin.targets[arch]
  if (!target) {
    throw new Error(`Unsupported AB Sherpa architecture: ${arch}`)
  }
  const directory = join(outputRoot, `linux-${arch}`)
  return { pin, target, directory, module: join(directory, 'node_modules', target.npm.name) }
}

async function command(program, args, extra = {}) {
  const result = await runProcess({ program, args, cwd: root, timeoutMs: 1_800_000, ...extra })
  if (result.code !== 0 || result.timedOut) {
    throw new Error(`${program} failed (${result.code}): ${result.stderr || result.stdout}`)
  }
  return result.stdout
}

async function archive(input, destination) {
  const cached = join(outputRoot, 'downloads', `${input.sha256}.tar.gz`)
  await fetchPinnedFile({
    ...input,
    destination: cached
  })
  await mkdir(destination, { recursive: true })
  await extractTar({ file: cached, cwd: destination, strip: 1, sync: false })
}

async function verifyOriginalPackage(directory, target) {
  for (const [name, sha256] of Object.entries(target.npm.files)) {
    if ((await hashFile(join(directory, name))) !== sha256) {
      throw new Error(`Sherpa npm input differs from its pinned archive: ${name}`)
    }
  }
}

export async function buildAbSherpaAddon(arch = process.arch) {
  if (process.platform !== 'linux' || process.arch !== arch) {
    throw new Error(
      'Build the AB Sherpa addon on a native Linux runner for the target architecture'
    )
  }
  const selected = await configuration(arch)
  const { pin, target, directory } = selected
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (packageJson.optionalDependencies[target.npm.name] !== pin.version) {
    throw new Error('The AB Sherpa source pin does not match package.json')
  }
  await verifyOriginalPackage(join(root, 'node_modules', target.npm.name), target)
  const work = join(outputRoot, 'work', `linux-${arch}`)
  const input = join(work, 'input')
  const output = join(work, 'output')
  await rm(work, { recursive: true, force: true })
  await rm(directory, { recursive: true, force: true })
  await mkdir(input, { recursive: true })
  await mkdir(output, { recursive: true })
  await archive(pin.source, join(input, 'source'))
  await archive(
    pin.nodeAddonApi,
    join(input, 'source/scripts/node-addon-api/node_modules/node-addon-api')
  )
  await archive(target.cmake, join(input, 'cmake'))
  await archive(target.npm, selected.module)
  await verifyOriginalPackage(selected.module, target)
  const node = nodeRuntimeAsset(`linux-${arch}-glibc`)
  const nodeArchive = join(pinnedNodeCacheDir(), node.archive)
  await fetchPinnedFile({
    url: nodeRuntimeReleaseUrl(node.source, node.archive),
    sha256: node.archiveSha256,
    destination: nodeArchive
  })
  await mkdir(join(input, 'node'))
  await extractTar({ file: nodeArchive, cwd: join(input, 'node'), strip: 1, sync: false })
  if ((await hashFile(join(input, 'node/bin/node'))) !== node.executableSha256) {
    throw new Error('The build Node executable differs from its pinned runtime')
  }
  await mkdir(join(input, 'sdk/include/sherpa-onnx'), { recursive: true })
  await cp(join(input, 'source/sherpa-onnx/c-api'), join(input, 'sdk/include/sherpa-onnx/c-api'), {
    recursive: true
  })
  await mkdir(join(input, 'sdk/lib'), { recursive: true })
  for (const filename of Object.keys(target.npm.files).filter((name) => name.endsWith('.so'))) {
    await cp(join(selected.module, filename), join(input, 'sdk/lib', filename))
  }
  const flags = [
    '-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_CXX_COMPILER=/usr/local/bin/g++',
    '-DCMAKE_C_COMPILER=/usr/local/bin/gcc',
    '-DCMAKE_JS_INC=/input/node/include/node',
    '-DCMAKE_LIBRARY_OUTPUT_DIRECTORY=/output/lib'
  ]
  const script = [
    'set -eu',
    `test "$(getconf GNU_LIBC_VERSION)" = "glibc ${pin.toolchain.glibc}"`,
    `test "$(g++ -dumpfullversion)" = "${pin.toolchain.gcc}"`,
    `test "$(node --version)" = "v${NODE_RUNTIME_PIN.version}"`,
    'getconf GNU_LIBC_VERSION > /output/toolchain.txt',
    'g++ --version >> /output/toolchain.txt',
    'cmake --version >> /output/toolchain.txt',
    'make --version >> /output/toolchain.txt',
    'node --version >> /output/toolchain.txt',
    `cmake -S /input/source/scripts/node-addon-api -B /output/build ${flags.join(' ')}`,
    'cmake --build /output/build --parallel 2'
  ].join('\n')
  await command('docker', ['pull', '--platform', target.platform, target.image], {
    stdio: 'inherit'
  })
  const image = JSON.parse(await command('docker', ['image', 'inspect', target.image]))[0]
  await command(
    'docker',
    [
      'run',
      '--rm',
      '--platform',
      target.platform,
      '--network=none',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--cpus=2',
      '--memory=4g',
      '--pids-limit=256',
      '--tmpfs',
      '/tmp:rw,nosuid,size=512m',
      '--user',
      `${process.getuid()}:${process.getgid()}`,
      '--mount',
      `type=bind,source=${input},target=/input,readonly`,
      '--mount',
      `type=bind,source=${output},target=/output`,
      '--env',
      'PATH=/input/node/bin:/input/cmake/bin:/usr/local/bin:/usr/bin:/bin',
      '--env',
      'SHERPA_ONNX_INSTALL_DIR=/input/sdk',
      '--env',
      'ORCA_BACKGROUND_LAUNCH=1',
      target.image,
      'sh',
      '-ec',
      script
    ],
    { stdio: 'inherit' }
  )
  const artifact = join(selected.module, addonFilename)
  await cp(join(output, 'lib', addonFilename), artifact)
  for (const [name, sha256] of Object.entries(target.npm.files)) {
    if (name !== addonFilename && (await hashFile(join(selected.module, name))) !== sha256) {
      throw new Error(`The addon rebuild modified an npm SDK file: ${name}`)
    }
  }
  verifyLinuxGlibcFloor(join(directory, 'node_modules'), { targetArch: arch })
  const nativeLicense = join(
    input,
    'source/scripts/node-addon-api/node_modules/node-addon-api/LICENSE.md'
  )
  await mkdir(join(directory, 'notices'), { recursive: true })
  await cp(nativeLicense, join(directory, 'notices/node-addon-api-LICENSE.md'))
  const receipt = {
    format: 1,
    package: target.npm.name,
    version: pin.version,
    arch,
    source: pin.source,
    buildPinSha256: await hashFile(pinPath),
    node: { version: NODE_RUNTIME_PIN.version, archiveSha256: node.archiveSha256 },
    nodeAddonApi: pin.nodeAddonApi,
    cmake: target.cmake,
    image: { reference: target.image, id: image.Id, repoDigests: image.RepoDigests },
    toolchain: await readFile(join(output, 'toolchain.txt'), 'utf8'),
    flags,
    originalAddonSha256: target.npm.files[addonFilename],
    rebuiltAddonSha256: await hashFile(artifact),
    compiledHeaderLicense: {
      package: 'node-addon-api',
      version: pin.nodeAddonApi.version,
      path: 'notices/node-addon-api-LICENSE.md',
      sha256: await hashFile(nativeLicense),
      source: `${pin.nodeAddonApi.url}#package/LICENSE.md`
    },
    preservedFiles: Object.fromEntries(
      Object.entries(target.npm.files).filter(([name]) => name !== addonFilename)
    ),
    glibcGate: 'Existing verifyLinuxGlibcFloor passed on the rebuilt module and unchanged npm DSOs'
  }
  await writeFile(join(directory, 'rebuild.json'), `${JSON.stringify(receipt, null, 2)}\n`)
  return { directory, module: selected.module, receipt }
}

export async function verifyBuiltAbSherpaAddon(arch, { requireRecognition = true } = {}) {
  const selected = await configuration(arch)
  const { pin, target, directory } = selected
  const receipt = JSON.parse(await readFile(join(directory, 'rebuild.json'), 'utf8'))
  if (
    receipt.format !== 1 ||
    receipt.package !== target.npm.name ||
    receipt.version !== pin.version ||
    receipt.arch !== arch ||
    receipt.source.commit !== pin.source.commit ||
    receipt.source.sha256 !== pin.source.sha256 ||
    receipt.image.reference !== target.image ||
    receipt.node.version !== NODE_RUNTIME_PIN.version ||
    receipt.buildPinSha256 !== (await hashFile(pinPath))
  ) {
    throw new Error('AB Sherpa rebuild evidence is missing or stale')
  }
  if (
    (await hashFile(join(selected.module, addonFilename))) !== receipt.rebuiltAddonSha256 ||
    receipt.originalAddonSha256 !== target.npm.files[addonFilename]
  ) {
    throw new Error('AB Sherpa addon differs from its rebuild receipt')
  }
  for (const [name, sha256] of Object.entries(target.npm.files)) {
    if (name !== addonFilename && (await hashFile(join(selected.module, name))) !== sha256) {
      throw new Error(`AB Sherpa SDK changed after the rebuild: ${name}`)
    }
  }
  if (requireRecognition) {
    const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const modelInputs = getSpeechModelDownloadMetadata(pin.recognition.model).downloadFiles.map(
      ({ name, sha256, url }) => ({ name, sha256, url })
    )
    for (const runtime of ['node', 'electron']) {
      const proof = JSON.parse(await readFile(join(directory, `asr-${runtime}.json`), 'utf8'))
      if (
        proof.format !== 1 ||
        proof.addonSha256 !== receipt.rebuiltAddonSha256 ||
        proof.package.name !== target.npm.name ||
        proof.package.version !== pin.version ||
        proof.model !== pin.recognition.model ||
        JSON.stringify(proof.modelInputs) !== JSON.stringify(modelInputs) ||
        proof.transcript !== pin.recognition.expectedTranscript ||
        proof.audioSha256 !== pin.recognition.audio.sha256 ||
        proof.workerSha256 !== (await hashFile(join(root, 'out/main/stt-worker.js'))) ||
        (runtime === 'node'
          ? proof.runtime.electron !== undefined || proof.runtime.node !== NODE_RUNTIME_PIN.version
          : proof.runtime.electron !== metadata.devDependencies.electron)
      ) {
        throw new Error(`AB Sherpa ${runtime} recognition evidence is missing or stale`)
      }
    }
  }
  return { ...selected, receipt }
}

export async function stageAbSherpaNativeNotices(context, notices) {
  const arch = { 1: 'x64', 3: 'arm64' }[context.arch]
  const built = await verifyBuiltAbSherpaAddon(arch)
  const module = join(context.appOutDir, 'resources/node_modules', built.target.npm.name)
  for (const [name, originalSha256] of Object.entries(built.target.npm.files)) {
    const expected = name === addonFilename ? built.receipt.rebuiltAddonSha256 : originalSha256
    if ((await hashFile(join(module, name))) !== expected) {
      throw new Error(`Packaged Sherpa file differs from its exact provenance: ${name}`)
    }
  }
  const directory = join(notices, 'native')
  await mkdir(directory, { recursive: true })
  const runtime = built.target.onnxruntime
  if ((await hashFile(join(module, 'libonnxruntime.so'))) !== runtime.librarySha256) {
    throw new Error('Packaged ONNX differs from its license archive')
  }
  const licenses = []
  for (const file of runtime.files) {
    const source = join(root, file.path)
    if ((await hashFile(source)) !== file.sha256) {
      throw new Error(`Pinned ONNX notice changed: ${file.path}`)
    }
    const name = file.member.split('/').at(-1)
    const path = `native/onnxruntime-${name}`
    await cp(source, join(notices, path))
    licenses.push({
      path,
      sha256: file.sha256,
      source: `${runtime.archive.url}#${file.member}`,
      artifact: 'libonnxruntime.so',
      artifactSha256: runtime.librarySha256
    })
  }
  const header = built.receipt.compiledHeaderLicense
  if ((await hashFile(join(built.directory, header.path))) !== header.sha256) {
    throw new Error('The compiled Node-API header license changed')
  }
  await cp(join(built.directory, header.path), join(directory, 'node-addon-api-LICENSE.md'))
  licenses.push({
    ...header,
    path: 'native/node-addon-api-LICENSE.md',
    artifact: addonFilename,
    artifactSha256: built.receipt.rebuiltAddonSha256
  })
  for (const name of ['rebuild.json', 'asr-node.json', 'asr-electron.json']) {
    await cp(join(built.directory, name), join(directory, name))
  }
  const evidence = {
    format: 1,
    package: built.target.npm.name,
    version: built.pin.version,
    source: built.pin.source,
    originalAddonSha256: built.receipt.originalAddonSha256,
    rebuiltAddonSha256: built.receipt.rebuiltAddonSha256,
    preservedFiles: built.receipt.preservedFiles,
    onnxruntime: runtime,
    licenses
  }
  await writeFile(join(directory, 'provenance.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  return evidence
}

export async function installBuiltAbSherpaAddon(context) {
  const arch = { 1: 'x64', 3: 'arm64' }[context.arch]
  const built = await verifyBuiltAbSherpaAddon(arch)
  const target = join(context.appOutDir, 'resources/node_modules', built.target.npm.name)
  await verifyOriginalPackage(target, built.target)
  await cp(join(built.module, addonFilename), join(target, addonFilename))
  if ((await hashFile(join(target, addonFilename))) !== built.receipt.rebuiltAddonSha256) {
    throw new Error('Packaged AB Sherpa addon differs from the verified build')
  }
  return built.receipt
}

if (isDirectInvocation(import.meta.url, process.argv[1])) {
  const arch = process.argv[2] ?? process.arch
  const result = await buildAbSherpaAddon(arch)
  console.log(JSON.stringify(result.receipt, null, 2))
}
