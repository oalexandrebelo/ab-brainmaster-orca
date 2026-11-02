import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
export async function writeReleaseBuildMetadata(name, metafiles, markerPaths) {
  const directory = join(root, 'out/reports')
  await mkdir(directory, { recursive: true })
  const markers = await Promise.all(
    markerPaths.map(async (path) => ({
      path: relative(root, path),
      sha256: createHash('sha256')
        .update(await readFile(path))
        .digest('hex')
    }))
  )
  await writeFile(
    join(directory, `ab-release-${name}.json`),
    JSON.stringify({ format: 1, metafiles, markers })
  )
}
