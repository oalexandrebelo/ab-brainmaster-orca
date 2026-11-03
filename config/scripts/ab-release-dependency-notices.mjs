import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const contributes = (usage) =>
  (usage.bytesInOutput ?? usage.renderedLength ?? usage.mappingReferences) > 0

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

export async function stageDependencyNotices(
  notices,
  {
    sources: requestedSources,
    generatedNames = ['mobile-mermaid-page', 'mobile-terminal-webview', 'mobile-terminal-document'],
    copiedInputs = [],
    basis = 'bundler outputs with positive contribution, expanded through hash-bound generated artifacts, plus copied runtime packages'
  } = {}
) {
  const pinnedDirectory = join(root, 'deploy/ab-brainmaster/licenses')
  const pins = JSON.parse(
    await readFile(join(pinnedDirectory, 'upstream-license-pins.json'), 'utf8')
  ).packages
  let sources
  if (requestedSources) {
    sources = await Promise.all(
      requestedSources.map(async (source) => [
        source.component,
        source.metafiles ?? (await report(source.report)),
        source.workingDirectory ?? root
      ])
    )
  } else {
    const local = JSON.parse(
      await readFile(join(root, 'packages/ab-local-runtime/dist/metafile.json'), 'utf8')
    )
    sources = [
      ['ab-control', await report('control'), root],
      ['ab-local-runtime', [local], root],
      ['orcad', await report('orcad'), root],
      ['mobile-web', await report('mobile-web'), join(root, 'mobile')]
    ]
  }
  const packages = new Map()
  async function include(input, component, base = root) {
    const selected = await packageForInput(input, base)
    let entry = packages.get(selected.directory)
    if (!entry) {
      entry = { ...selected, usedBy: new Set() }
      packages.set(selected.directory, entry)
    }
    entry.usedBy.add(component)
  }
  const includedFiles = new Set()
  for (const [component, metafiles, base] of sources) {
    const inputs = new Set()
    for (const metafile of metafiles) {
      for (const output of Object.values(metafile.outputs)) {
        for (const [input, usage] of Object.entries(output.inputs)) {
          if (contributes(usage)) {
            includedFiles.add(resolve(base, input))
            if (input.split(/[\\/]/).includes('node_modules')) {
              inputs.add(input)
            }
          }
        }
      }
    }
    for (const input of inputs) {
      await include(input, component, base)
    }
  }
  const generated = []
  const assets = new Map()
  for (const name of generatedNames) {
    const evidence = JSON.parse(
      await readFile(join(root, `out/reports/ab-release-generated-${name}.json`), 'utf8')
    )
    if (evidence.format !== 1 || !Array.isArray(evidence.artifacts) || !evidence.artifacts.length) {
      throw new Error(`Missing generated build evidence for ${name}`)
    }
    for (const artifact of evidence.artifacts) {
      const path = resolve(root, artifact.path)
      if (digest(await readFile(path)) !== artifact.sha256) {
        throw new Error(`Stale generated metadata for ${artifact.path}; rebuild before packaging`)
      }
      const included = includedFiles.has(path)
      generated.push({
        path: artifact.path.split(sep).join('/'),
        sha256: artifact.sha256,
        included
      })
      if (!included) {
        continue
      }
      const component = `generated:${artifact.path.split(sep).join('/')}`
      const base = resolve(root, artifact.workingDirectory)
      const inputs = new Set()
      for (const metafile of artifact.metafiles) {
        for (const output of Object.values(metafile.outputs)) {
          for (const [input, usage] of Object.entries(output.inputs)) {
            if (contributes(usage) && input.split(/[\\/]/).includes('node_modules')) {
              inputs.add(input)
            }
          }
        }
      }
      for (const input of inputs) {
        await include(input, component, base)
      }
      for (const input of artifact.copiedInputs) {
        const inputPath = resolve(root, input.path)
        if (digest(await readFile(inputPath)) !== input.sha256) {
          throw new Error(`Stale copied input for ${artifact.path}; rebuild before packaging`)
        }
        if (input.path.split(/[\\/]/).includes('node_modules')) {
          await include(inputPath, component)
        } else {
          if (!input.license) {
            throw new Error(`A generated asset has no license evidence: ${input.path}`)
          }
          const licensePath = resolve(root, input.license.path)
          if (digest(await readFile(licensePath)) !== input.license.sha256) {
            throw new Error(`Generated asset license changed: ${input.license.path}`)
          }
          const target = `assets/${input.license.path.split(sep).join('/')}`
          await mkdir(dirname(join(notices, target)), { recursive: true })
          await cp(licensePath, join(notices, target))
          assets.set(input.path, {
            path: input.path.split(sep).join('/'),
            sha256: input.sha256,
            license: { path: target, sha256: input.license.sha256 },
            usedBy: component
          })
        }
      }
    }
  }
  for (const input of copiedInputs) {
    await include(input.path, input.component)
  }
  if (!requestedSources) {
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
          (metadata.license !== undefined
            ? value.declaredLicense === metadata.license
            : metadata.licenses !== undefined &&
              JSON.stringify(value.declaredLicenses) === JSON.stringify(metadata.licenses))
      )
      if (pin) {
        const path = pin.packagedFile
          ? join(directory, pin.packagedFile)
          : join(pinnedDirectory, pin.file)
        if (digest(await readFile(path)) !== pin.sha256) {
          throw new Error(
            `Pinned upstream license changed for ${metadata.name}@${metadata.version}`
          )
        }
        licenses = [
          {
            path,
            member: pin.packagedFile ?? 'UPSTREAM-LICENSE.txt',
            source: pin.source,
            provenance: pin.provenance,
            evidence: pin.evidence
          }
        ]
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
        ...(license.source ? { source: license.source } : {}),
        ...(license.provenance ? { provenance: license.provenance } : {}),
        ...(license.evidence ? { evidence: license.evidence } : {})
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
    `${JSON.stringify({ format: 1, basis, sources: sources.map(([component, metafiles]) => ({ component, provenance: metafiles.map((metafile) => metafile.x_provenance ?? { bundler: 'esbuild', selection: 'outputs.inputs.bytesInOutput > 0', lengthUnit: 'bytes' }) })), generated, assets: [...assets.values()], packages: result }, null, 2)}\n`
  )
  return result
}
