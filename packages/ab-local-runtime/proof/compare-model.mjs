import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createLocalRuntime } from '../dist/runtime.mjs'
import { evaluateAnswer } from './evaluate-answer.mjs'

const [baselineDirectory, outputDirectory, model, digest] = process.argv.slice(2)
assert.ok(
  baselineDirectory && outputDirectory && model && digest,
  'Provide baseline directory, output directory, model and digest.'
)
const baseline = JSON.parse(
  await readFile(path.join(baselineDirectory, 'task-result.json'), 'utf8')
)
const configuration = JSON.parse(
  await readFile(path.join(baselineDirectory, 'config.json'), 'utf8')
)
const request = JSON.parse(await readFile(path.join(baselineDirectory, 'request.json'), 'utf8'))
configuration.model = model
configuration.allowedModels = [{ name: model, digest }]
configuration.stateDirectory = path.resolve(outputDirectory, 'task-state')
request.idempotencyKey = `${request.idempotencyKey}:comparison:${model}`
await mkdir(outputDirectory, { recursive: true })
const runtime = await createLocalRuntime(configuration)
let result
try {
  result = await runtime.submit(request)
} finally {
  await runtime.close()
}
await writeFile(
  path.join(outputDirectory, 'task-result.json'),
  `${JSON.stringify(result, null, 2)}\n`,
  { mode: 0o600 }
)
assert.equal(result.status, 'succeeded')
assert.equal(
  result.prompt.sha256,
  baseline.prompt.sha256,
  'A comparison requires byte-identical prompts.'
)
const receipt = {
  createdAt: new Date().toISOString(),
  scope:
    'Local SDK inference comparison; the baseline separately proved the real Orca PTY journey. No network isolation is claimed by this comparison.',
  byteIdenticalPrompt: true,
  promptSha256: result.prompt.sha256,
  baseline: {
    taskId: baseline.id,
    model: baseline.provenance.model,
    provider: baseline.provenance.provider,
    quality: evaluateAnswer(baseline.result.text)
  },
  candidate: {
    taskId: result.id,
    model: result.provenance.model,
    provider: result.provenance.provider,
    quality: evaluateAnswer(result.result.text)
  }
}
await writeFile(
  path.join(outputDirectory, 'comparison-receipt.json'),
  `${JSON.stringify(receipt, null, 2)}\n`
)
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
