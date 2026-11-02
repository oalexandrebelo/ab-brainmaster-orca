import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function packageForInput(input, base = root) {
  let directory = dirname(await realpath(resolve(base, input)))
  while (directory !== dirname(directory)) {
    try {
      const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (metadata.name && metadata.version) {
        return { directory, metadata }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
    directory = dirname(directory)
  }
  throw new Error(`A bundled dependency has no package metadata: ${input}`)
}

async function licenseFiles(directory) {
  const files = []
  async function walk(current) {
    for (const name of (await readdir(current)).sort()) {
      if (['node_modules', '.git', '.cache'].includes(name)) {
        continue
      }
      const path = join(current, name)
      const stat = await lstat(path)
      if (stat.isDirectory()) {
        await walk(path)
      } else if (
        stat.isFile() &&
        /^(?:licen[cs]e|copying|notice|copyright)(?:[._-].*)?$/i.test(name)
      ) {
        files.push(path)
      }
    }
  }
  await walk(directory)
  return files
}

async function report(name) {
  const value = JSON.parse(
    await readFile(join(root, `out/reports/ab-release-${name}.json`), 'utf8')
  )
  if (value.format !== 1 || !Array.isArray(value.metafiles) || !value.markers?.length) {
    throw new Error(`Missing build evidence for ${name}`)
  }
  for (const marker of value.markers) {
    if (digest(await readFile(resolve(root, marker.path))) !== marker.sha256) {
      throw new Error(`Stale build metadata for ${name}; rebuild before packaging`)
    }
  }
  return value.metafiles
}

export async function stageDependencyNotices(notices) {
  const pinnedDirectory = join(root, 'deploy/ab-brainmaster/licenses')
  const pins = JSON.parse(
    await readFile(join(pinnedDirectory, 'upstream-license-pins.json'), 'utf8')
  ).packages
  const local = JSON.parse(
    await readFile(join(root, 'packages/ab-local-runtime/dist/metafile.json'), 'utf8')
  )
  const sources = [
    ['ab-control', await report('control')],
    ['ab-local-runtime', [local]],
    ['orcad', await report('orcad')],
    ['mobile-web', await report('mobile-web')]
  ]
  const packages = new Map()
  async function include(input, component) {
    const selected = await packageForInput(
      input,
      component === 'mobile-web' ? join(root, 'mobile') : root
    )
    let entry = packages.get(selected.directory)
    if (!entry) {
      entry = { ...selected, usedBy: new Set() }
      packages.set(selected.directory, entry)
    }
    entry.usedBy.add(component)
  }
  for (const [component, metafiles] of sources) {
    const inputs = new Set()
    for (const metafile of metafiles) {
      for (const output of Object.values(metafile.outputs)) {
        for (const [input, usage] of Object.entries(output.inputs)) {
          if (usage.bytesInOutput > 0 && input.split(/[\\/]/).includes('node_modules')) {
            inputs.add(input)
          }
        }
      }
    }
    for (const input of inputs) {
      await include(input, component)
    }
  }
  for (const name of [
    'node-pty',
    '@parcel/watcher',
    '@vscode/ripgrep-universal',
    'emojibase-data'
  ]) {
    await include(join(root, 'node_modules', name, 'package.json'), 'orcad-copied-artifact')
  }
  try {
    await lstat(join(root, 'out/orcad', `agent-browser-${process.platform}-${process.arch}`))
    await include(join(root, 'node_modules/agent-browser/package.json'), 'orcad-copied-artifact')
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  const index = new Map()
  const missing = []
  for (const { directory, metadata, usedBy } of packages.values()) {
    let licenses = (await licenseFiles(directory)).map((path) => ({
      path,
      member: relative(directory, path).split(sep).join('/')
    }))
    if (!licenses.length) {
      const pin = pins.find(
        (value) =>
          value.package === metadata.name &&
          value.version === metadata.version &&
          value.declaredLicense === metadata.license
      )
      if (pin) {
        const path = join(pinnedDirectory, pin.file)
        if (digest(await readFile(path)) !== pin.sha256) {
          throw new Error(
            `Pinned upstream license changed for ${metadata.name}@${metadata.version}`
          )
        }
        licenses = [{ path, member: 'UPSTREAM-LICENSE.txt', source: pin.source }]
      }
    }
    if (!licenses.length) {
      missing.push(`${metadata.name}@${metadata.version}`)
      continue
    }
    const identifier = `${metadata.name.replaceAll('/', '__')}@${metadata.version}`
    const record = index.get(identifier) ?? {
      name: metadata.name,
      version: metadata.version,
      license: metadata.license ?? metadata.licenses ?? 'SEE LICENSE FILES',
      usedBy: [],
      files: []
    }
    record.usedBy = [...new Set([...record.usedBy, ...usedBy])].sort()
    for (const license of licenses) {
      const bytes = await readFile(license.path)
      const path = `npm/${identifier}/${license.member}`
      const checksum = digest(bytes)
      const existing = record.files.find((file) => file.path === path)
      if (existing && existing.sha256 !== checksum) {
        throw new Error(`Conflicting license bytes for ${metadata.name}@${metadata.version}`)
      }
      if (existing) {
        continue
      }
      await mkdir(dirname(join(notices, path)), { recursive: true })
      await cp(license.path, join(notices, path))
      record.files.push({
        path,
        sha256: checksum,
        bytes: bytes.length,
        ...(license.source ? { source: license.source } : {})
      })
    }
    record.files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
    index.set(identifier, record)
  }
  if (missing.length) {
    throw new Error(`Bundled packages without license files: ${missing.sort().join(', ')}`)
  }
  const result = [...index.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en')
  )
  await writeFile(
    join(notices, 'dependencies.json'),
    `${JSON.stringify({ format: 1, basis: 'esbuild output inputs with positive byte contribution, plus copied runtime packages', packages: result }, null, 2)}\n`
  )
  return result
}
