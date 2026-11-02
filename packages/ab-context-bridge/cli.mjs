#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { createContextBridge, ContextBridgeError } from './bridge.mjs'
import { connectConfiguredMcp } from './mcp-connection.mjs'

async function main() {
  const [command, configPath, requestPath, ...extra] = process.argv.slice(2)
  if (command === '--help' || !command) {
    process.stdout.write(
      'Usage: node packages/ab-context-bridge/cli.mjs discover <config.json>\n       node packages/ab-context-bridge/cli.mjs retrieve <config.json> <request.json>\nJSON goes to stdout. Exit 2 means an explicit connection, contract or context failure.\n'
    )
    return
  }
  if (
    !['discover', 'retrieve'].includes(command) ||
    !configPath ||
    extra.length ||
    (command === 'retrieve' && !requestPath) ||
    (command === 'discover' && requestPath)
  ) {
    throw new ContextBridgeError('INVALID_ARGUMENT', 'Use --help for the supported commands.')
  }
  const readJson = async (file) => {
    const text = await readFile(file, 'utf8')
    if (Buffer.byteLength(text) > 65536) {
      throw new ContextBridgeError('INVALID_CONFIGURATION', 'The JSON input exceeds 64 KiB.')
    }
    return JSON.parse(text)
  }
  const config = await readJson(configPath)
  const request = command === 'retrieve' ? await readJson(requestPath) : {}
  const connection = await connectConfiguredMcp(config.transport, { timeoutMs: config.timeoutMs })
  try {
    const bridge = createContextBridge({ ...config, client: connection.client })
    const result = command === 'discover' ? await bridge.discover() : await bridge.retrieve(request)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    await connection.close()
  }
}

try {
  await main()
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ error: error instanceof ContextBridgeError ? error.toJSON() : { code: 'INVALID_INPUT_OR_CONFIGURATION', message: 'Could not load the configuration or request.' } })}\n`
  )
  process.exitCode = 2
}
