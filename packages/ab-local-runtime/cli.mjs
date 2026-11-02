#!/usr/bin/env node
import { open } from 'node:fs/promises'
import { createLocalRuntime, LocalRuntimeError } from './runtime.mjs'

async function readJson(filename) {
  const file = await open(filename, 'r')
  try {
    const bytes = Buffer.alloc(131073)
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
    if (bytesRead > 131072) {
      throw new LocalRuntimeError('INPUT_LIMIT', 'The JSON file exceeds 128 KiB.')
    }
    return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'))
  } finally {
    await file.close()
  }
}

async function main() {
  const [command, configFile, argument, ...extra] = process.argv.slice(2)
  if (!command || command === '--help') {
    process.stdout.write(
      'Usage: ab-local submit <config.json> <request.json>\n       ab-local get <config.json> <task-id>\n       ab-local list <config.json>\n       ab-local recover <config.json>\nJSON goes to stdout. Exit 2 means failure, cancellation, timeout or interrupted work.\n'
    )
    return
  }
  if (
    !['submit', 'get', 'list', 'recover'].includes(command) ||
    !configFile ||
    extra.length ||
    (['submit', 'get'].includes(command) ? !argument : argument)
  ) {
    throw new LocalRuntimeError('INVALID_ARGUMENT', 'Use --help for supported commands.')
  }
  const runtime = await createLocalRuntime(await readJson(configFile))
  const controller = new AbortController()
  const abort = () => controller.abort()
  process.once('SIGINT', abort)
  process.once('SIGTERM', abort)
  try {
    const result =
      command === 'submit'
        ? await runtime.submit(await readJson(argument), { signal: controller.signal })
        : command === 'get'
          ? runtime.get(argument)
          : command === 'recover'
            ? runtime.recover()
            : runtime.list()
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (result === null || (result?.status && result.status !== 'succeeded')) {
      process.exitCode = 2
    }
  } finally {
    process.removeListener('SIGINT', abort)
    process.removeListener('SIGTERM', abort)
    await runtime.close()
  }
}

try {
  await main()
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ error: error instanceof LocalRuntimeError ? error.toJSON() : { code: 'INVALID_INPUT_OR_STATE', message: 'Could not read the configuration, request or local state.' } })}\n`
  )
  process.exitCode = 2
}
