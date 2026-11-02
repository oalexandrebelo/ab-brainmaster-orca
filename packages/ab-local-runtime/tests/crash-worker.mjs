import { readFile } from 'node:fs/promises'
import { createLocalRuntime } from '../runtime.mjs'

const runtime = await createLocalRuntime(JSON.parse(await readFile(process.argv[2], 'utf8')))
try {
  const result = await runtime.submit({
    idempotencyKey: 'crash-recovery',
    task: 'Persist this task before provider completion.'
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
} finally {
  await runtime.close()
}
