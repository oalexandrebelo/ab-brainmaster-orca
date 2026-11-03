import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { getSpeechModelDownloadMetadata } from '../../src/main/speech/model-download-catalog.ts'
import { fetchPinnedFile } from './pinned-node-downloads.mjs'
import { verifyBuiltAbSherpaAddon } from './ab-sherpa-addon.mjs'
import { isDirectInvocation } from './script-entry-detection.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function decodeSpeechProofWave(wave) {
  if (wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('The official speech sample is not a RIFF WAVE file')
  }
  let sampleRate
  let samples
  for (let offset = 12; offset + 8 <= wave.length;) {
    const id = wave.toString('ascii', offset, offset + 4)
    const length = wave.readUInt32LE(offset + 4)
    const start = offset + 8
    if (start + length > wave.length) {
      throw new Error('Truncated speech sample WAVE chunk')
    }
    if (id === 'fmt ') {
      if (
        length < 16 ||
        wave.readUInt16LE(start) !== 1 ||
        wave.readUInt16LE(start + 2) !== 1 ||
        wave.readUInt16LE(start + 14) !== 16
      ) {
        throw new Error('The speech proof requires PCM16 mono audio')
      }
      sampleRate = wave.readUInt32LE(start + 4)
    }
    if (id === 'data') {
      if (length % 2 !== 0) {
        throw new Error('The speech sample contains a partial PCM16 frame')
      }
      samples = Float32Array.from(
        { length: length / 2 },
        (_, index) => wave.readInt16LE(start + index * 2) / 32768
      )
    }
    offset = start + length + (length % 2)
  }
  if (!samples?.length || sampleRate !== 16000) {
    throw new Error('Unexpected official speech sample format')
  }
  return { samples, sampleRate }
}

async function recognizeWithOrcaWorker(workerPath, module, modelDir, files, audio) {
  const worker = new Worker(workerPath, { workerData: { sherpaModulePath: module } })
  const messages = []
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The real ASR worker timed out')), 45000)
      let complete = false
      const fail = (error) => {
        clearTimeout(timeout)
        reject(error)
      }
      worker.on('error', fail)
      worker.on('exit', (code) => {
        if (!complete) {
          fail(new Error(`ASR worker exited before completion: ${code}`))
        }
      })
      worker.on('message', (message) => {
        messages.push(message)
        if (message.type === 'error') {
          return fail(new Error(message.error))
        }
        if (message.type === 'ready') {
          worker.postMessage({ type: 'feed', ...audio })
          worker.postMessage({ type: 'stop' })
        }
        if (message.type === 'stopped') {
          complete = true
          clearTimeout(timeout)
          resolve()
        }
      })
      worker.postMessage({
        type: 'init',
        modelDir,
        modelType: 'transducer',
        streaming: true,
        sampleRate: audio.sampleRate,
        files
      })
    })
    return messages
  } finally {
    await worker.terminate()
  }
}

export async function verifyAbSherpaAsr(arch = process.arch) {
  if (process.platform !== 'linux' || process.arch !== arch) {
    throw new Error('Run the speech proof on its native Linux architecture')
  }
  const built = await verifyBuiltAbSherpaAddon(arch, { requireRecognition: false })
  const { recognition } = built.pin
  const modelDir = join(root, 'out/ab-sherpa/asr-model')
  const model = getSpeechModelDownloadMetadata(recognition.model)
  for (const file of model.downloadFiles) {
    await fetchPinnedFile({
      url: file.url,
      sha256: file.sha256,
      destination: join(modelDir, file.name)
    })
  }
  const audioPath = await fetchPinnedFile({
    ...recognition.audio,
    destination: join(modelDir, 'official-sample.wav')
  })
  const audio = decodeSpeechProofWave(await readFile(audioPath))
  const workerPath = join(root, 'out/main/stt-worker.js')
  const started = performance.now()
  const messages = await recognizeWithOrcaWorker(
    workerPath,
    built.module,
    modelDir,
    model.files,
    audio
  )
  const transcript = messages
    .filter((item) => item.type === 'final')
    .map((item) => item.text)
    .join(' ')
    .trim()
  if (transcript !== recognition.expectedTranscript) {
    throw new Error(`The rebuilt addon changed the pinned recognition result: ${transcript}`)
  }
  const runtime = process.versions.electron ? 'electron' : 'node'
  const proof = {
    format: 1,
    runtime: process.versions,
    package: { name: built.target.npm.name, version: built.pin.version },
    addonSha256: built.receipt.rebuiltAddonSha256,
    workerSha256: digest(await readFile(workerPath)),
    model: recognition.model,
    modelInputs: model.downloadFiles.map(({ name, sha256, url }) => ({ name, sha256, url })),
    audioSha256: recognition.audio.sha256,
    audioSource: recognition.audio.url,
    audioSeconds: audio.samples.length / audio.sampleRate,
    elapsedMs: performance.now() - started,
    peakRssKiB: process.resourceUsage().maxRSS,
    transcript,
    comparisonBasis: recognition.expectedTranscriptBasis,
    messages
  }
  await writeFile(
    join(built.directory, `asr-${runtime}.json`),
    `${JSON.stringify(proof, null, 2)}\n`
  )
  return proof
}

if (isDirectInvocation(import.meta.url, process.argv[1])) {
  console.log(JSON.stringify(await verifyAbSherpaAsr(process.argv[2] ?? process.arch), null, 2))
}
