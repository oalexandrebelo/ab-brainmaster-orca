import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { MODEL_DIGEST, MODEL_MANIFEST_BYTES, MODEL_NAME } from './prepare-context.mjs'

const directory = path.resolve(process.argv[2])
const registry = 'https://registry.ollama.ai/v2/library/qwen3'

async function download(url, target, digest, expectedBytes) {
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.part`
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) })
  assert.equal(response.status, 200, `Download failed for ${url}`)
  const hash = createHash('sha256')
  let bytes = 0
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length
          if (bytes > expectedBytes) {
            callback(new Error('Download exceeds its pinned size.'))
            return
          }
          hash.update(chunk)
          callback(null, chunk)
        }
      }),
      createWriteStream(temporary, { mode: 0o600 })
    )
    assert.equal(hash.digest('hex'), digest, `Digest mismatch for ${url}`)
    assert.equal(bytes, expectedBytes, `Size mismatch for ${url}`)
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
}

const manifestFile = path.join(directory, 'manifests/registry.ollama.ai/library/qwen3/1.7b')
await download(`${registry}/manifests/1.7b`, manifestFile, MODEL_DIGEST, MODEL_MANIFEST_BYTES)
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
for (const blob of [manifest.config, ...manifest.layers]) {
  assert.match(blob.digest, /^sha256:[a-f0-9]{64}$/)
  await download(
    `${registry}/blobs/${blob.digest}`,
    path.join(directory, 'blobs', blob.digest.replace(':', '-')),
    blob.digest.slice(7),
    blob.size
  )
}
process.stdout.write(
  `${JSON.stringify({ model: MODEL_NAME, manifestSha256: MODEL_DIGEST, filesVerified: manifest.layers.length + 2 })}\n`
)
