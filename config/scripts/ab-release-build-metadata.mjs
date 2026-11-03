import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const checksum = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex')

export async function writeReleaseGeneratedMetadata(name, artifacts, workingDirectory) {
  const directory = join(root, 'out/reports')
  await mkdir(directory, { recursive: true })
  const records = await Promise.all(
    artifacts.map(async ({ path, metafile, copiedInputs = [] }) => ({
      path: relative(root, path),
      sha256: await checksum(path),
      workingDirectory: relative(root, workingDirectory),
      metafiles: metafile ? [metafile] : [],
      copiedInputs: await Promise.all(
        copiedInputs.map(async ({ path: input, licensePath }) => ({
          path: relative(root, input),
          sha256: await checksum(input),
          ...(licensePath
            ? {
                license: {
                  path: relative(root, licensePath),
                  sha256: await checksum(licensePath)
                }
              }
            : {})
        }))
      )
    }))
  )
  await writeFile(
    join(directory, `ab-release-generated-${name}.json`),
    JSON.stringify({ format: 1, artifacts: records })
  )
}

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
