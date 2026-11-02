#!/usr/bin/env node
import { createReviewer } from './review.mjs'

const [command, ...args] = process.argv.slice(2)
if (command === 'review' && args.length === 0) {
  const report = await createReviewer()({ confirmed: true })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = report.status === 'complete' ? 0 : 2
} else {
  process.stdout.write(
    'Uso: node packages/ab-upstream-review/cli.mjs review\nConsulta GET explícita de stablyai/orca; emite JSON. Código 0 = metadados completos; 2 = parcial/erro.\n'
  )
  if (command && command !== '--help') {
    process.exitCode = 1
  }
}
