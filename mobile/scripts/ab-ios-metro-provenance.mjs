import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const metroRequire = createRequire(require.resolve('expo/metro-config'))
const { decode } = metroRequire('@jridgewell/sourcemap-codec')
const digest = (value) => createHash('sha256').update(value).digest('hex')

function inside(root, absolute) {
  const relative = path.relative(root, absolute)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function sourceFile(source, sourceRoot, content, projectRoot) {
  const repository = fs.realpathSync(path.resolve(projectRoot, '..'))
  const value = source.startsWith('file:') ? fileURLToPath(source) : source
  const explicit =
    source.startsWith('file:') || (path.isAbsolute(value) && inside(repository, value))
  const projected = explicit
    ? [value]
    : [projectRoot, repository].map((root) =>
        path.resolve(root, sourceRoot ?? '.', value.replace(/^\//, ''))
      )
  const candidates = new Map()
  for (const projectedPath of projected) {
    if (!inside(repository, projectedPath) || !fs.existsSync(projectedPath)) {
      continue
    }
    const absolute = fs.realpathSync(projectedPath)
    if (inside(repository, absolute) && fs.statSync(absolute).isFile()) {
      const bytes = fs.readFileSync(absolute)
      candidates.set(absolute, { absolute, sha256: digest(bytes) })
    }
  }
  if (!candidates.size) {
    throw new Error(`Metro source is missing, outside the repository, or not a file: ${source}`)
  }
  const sourceContentSha256 = typeof content === 'string' ? digest(content) : null
  const matched = [...candidates.values()].filter((file) => file.sha256 === sourceContentSha256)
  if (matched.length > 1) {
    throw new Error(`Metro source content matches ambiguous checkout paths: ${source}`)
  }
  if (matched.length === 1) {
    return { ...matched[0], sourceContentSha256, contentVerification: 'sha256-match' }
  }
  // Metro omits PNG content; retain only an unambiguous full-path reference and local digest.
  if (content === '' && path.extname(value).toLowerCase() === '.png' && candidates.size === 1) {
    return {
      ...candidates.values().next().value,
      sourceContentSha256,
      contentVerification: 'not-in-source-map'
    }
  }
  throw new Error(
    `Metro source changed since Metro bundled it, lacks content, or is ambiguous: ${source}`
  )
}

export function metroNoticeProvenance(sourceMap, projectRoot) {
  const inputs = {}
  const sources = new Map()
  const virtual = []
  let mappingReferences = 0
  function visit(map) {
    if (map.version !== 3) {
      throw new Error('iOS notices require a version 3 source map.')
    }
    if (Array.isArray(map.sections)) {
      for (const section of map.sections) {
        if (!section.map || section.url) {
          throw new Error('External source-map sections are not permitted.')
        }
        visit(section.map)
      }
      return
    }
    if (!Array.isArray(map.sources) || typeof map.mappings !== 'string') {
      throw new Error('The Metro source map has no source mappings.')
    }
    const references = new Map()
    for (const line of decode(map.mappings)) {
      for (const segment of line) {
        if (segment.length < 4) {
          continue
        }
        const index = segment[1]
        if (!Number.isInteger(index) || index < 0 || index >= map.sources.length) {
          throw new Error('The Metro source map references a missing source.')
        }
        references.set(index, (references.get(index) ?? 0) + 1)
      }
    }
    for (const [index, count] of references) {
      const source = map.sources[index]
      if (typeof source !== 'string') {
        throw new Error('Invalid source-map source name.')
      }
      const content = map.sourcesContent?.[index]
      mappingReferences += count
      if (
        source === '__prelude__' ||
        source.startsWith('\0polyfill:') ||
        /^\/app\?ctx=[a-f0-9]+$/.test(source)
      ) {
        virtual.push({
          source,
          mappingReferences: count,
          sourceContentSha256: typeof content === 'string' ? digest(content) : null
        })
        continue
      }
      const file = sourceFile(source, map.sourceRoot, content, projectRoot)
      const { absolute } = file
      inputs[absolute] = { mappingReferences: (inputs[absolute]?.mappingReferences ?? 0) + count }
      sources.set(absolute, {
        path: path.relative(path.resolve(projectRoot, '..'), absolute).split(path.sep).join('/'),
        sha256: file.sha256,
        sourceContentSha256: file.sourceContentSha256,
        contentVerification: file.contentVerification,
        sourceMapSources: [
          ...new Set([...(sources.get(absolute)?.sourceMapSources ?? []), source])
        ],
        mappingReferences: inputs[absolute].mappingReferences
      })
    }
  }
  visit(sourceMap)
  if (!sources.size) {
    throw new Error('The Metro source map contains no file-backed emitted modules.')
  }
  return {
    metafile: {
      outputs: { 'main.jsbundle': { inputs } },
      x_provenance: {
        bundler: 'Metro/Hermes',
        selection: 'source indices referenced by emitted source-map segments',
        lengthUnit: 'source-map references'
      }
    },
    sources: [...sources.values()].sort((a, b) => a.path.localeCompare(b.path, 'en')),
    virtual,
    mappingReferences
  }
}
