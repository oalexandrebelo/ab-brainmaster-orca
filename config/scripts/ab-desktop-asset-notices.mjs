import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFile, listPackage } from '@electron/asar'

const root = fileURLToPath(new URL('../..', import.meta.url))
const pinPath = join(root, 'deploy/ab-brainmaster/licenses/desktop-font-pins.json')
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

export async function stageDesktopFontNotices(resources, notices) {
  const pinBytes = await readFile(pinPath)
  const pin = JSON.parse(pinBytes.toString())
  if (pin.format !== 1 || !pin.groups?.length) {
    throw new Error('Desktop font provenance is missing')
  }
  const sources = new Map()
  for (const group of pin.groups) {
    for (const asset of group.assets) {
      const key = asset.sha256
      const matching = sources.get(key) ?? []
      matching.push({ group, asset })
      sources.set(key, matching)
    }
  }
  const archive = join(resources, 'app.asar')
  const used = new Map()
  for (const member of listPackage(archive)) {
    const path = member.replaceAll('\\', '/').replace(/^\//, '')
    if (!path.startsWith('out/renderer/') || !/\.(?:woff2?|ttf|otf|pfb)$/i.test(path)) {
      continue
    }
    const bytes = extractFile(archive, path)
    const sha256 = digest(bytes)
    const selected = sources.get(sha256)?.[0]
    if (!selected) {
      throw new Error(`Packaged desktop font has no exact notice provenance: ${path}`)
    }
    const { group, asset } = selected
    if (digest(await readFile(join(root, asset.path))) !== sha256) {
      throw new Error(`Desktop font differs from its pinned source: ${asset.path}`)
    }
    const record = used.get(group.id) ?? {
      id: group.id,
      origin: group.origin,
      provenance: group.provenance,
      fonts: [],
      licenses: []
    }
    record.fonts.push({
      path: `app.asar/${path}`,
      sha256,
      bytes: bytes.length,
      source: asset.path,
      embeddedNames: asset.embeddedNames
    })
    used.set(group.id, record)
  }
  for (const group of pin.groups) {
    const record = used.get(group.id)
    if (!record) {
      continue
    }
    if (group.package) {
      const metadata = JSON.parse(await readFile(join(root, group.package.path), 'utf8'))
      if (metadata.name !== group.package.name || metadata.version !== group.package.version) {
        throw new Error(`Desktop font package changed: ${group.package.name}`)
      }
    }
    for (const license of group.licenses) {
      const source = join(root, license.path)
      const bytes = await readFile(source)
      if (digest(bytes) !== license.sha256) {
        throw new Error(`Desktop font license changed: ${license.path}`)
      }
      const path = `assets/${group.id}/${basename(license.path)}`
      await mkdir(dirname(join(notices, path)), { recursive: true })
      await cp(source, join(notices, path))
      record.licenses.push({
        path,
        sha256: license.sha256,
        bytes: bytes.length,
        source: license.source
      })
    }
  }
  const evidence = {
    format: 1,
    basis: 'Actual renderer font files from ASAR matched by SHA256 to pinned input bytes',
    pinSha256: digest(pinBytes),
    groups: [...used.values()]
  }
  await mkdir(join(notices, 'assets'), { recursive: true })
  await writeFile(join(notices, 'assets/provenance.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  return evidence
}
