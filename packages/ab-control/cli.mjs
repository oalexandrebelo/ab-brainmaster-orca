#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ControlClient } from './sdk.mjs'
import { createControlServer } from './server.mjs'
import { createCredential } from './credentials.mjs'
import { OPERATIONS, publicError } from './contract.mjs'

export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args
  if (command === 'init-auth' || command === 'rotate-auth') {
    if (rest.length !== 1) {
      throw new Error('Supply exactly one credential file path.')
    }
    console.log(
      JSON.stringify({
        ok: true,
        credentialFile: createCredential(rest[0], { rotate: command === 'rotate-auth' })
      })
    )
    return
  }
  if (command === 'serve') {
    if (rest.length) {
      throw new Error('Server configuration uses AB_CONTROL_* environment variables.')
    }
    const server = await createControlServer({
      profile: process.env.AB_CONTROL_PROFILE,
      pairingFile: process.env.AB_CONTROL_PAIRING_FILE,
      tokenFile: process.env.AB_CONTROL_TOKEN_FILE,
      port: Number(process.env.AB_CONTROL_PORT ?? 0),
      host: process.env.AB_CONTROL_CONTAINER === '1' ? '0.0.0.0' : '127.0.0.1',
      container: process.env.AB_CONTROL_CONTAINER === '1',
      publishedPort: Number(process.env.AB_CONTROL_PUBLISHED_PORT)
    })
    console.log(JSON.stringify({ type: 'ab_control_ready', url: server.url }))
    for (const signal of ['SIGTERM', 'SIGINT']) {
      process.once(
        signal,
        () =>
          void server.close().catch(() => {
            process.exitCode = 1
          })
      )
    }
    return
  }
  if (command === 'help' || !command) {
    console.log(
      `ab-control init-auth FILE | rotate-auth FILE | serve | ${Object.keys(OPERATIONS).join(' | ')} [PARAMS_JSON_FILE]\nClient configuration: AB_CONTROL_URL and AB_CONTROL_TOKEN_FILE. Credentials are never command arguments.`
    )
    return
  }
  if (rest.length > 1) {
    throw new Error('Supply at most one parameters JSON file.')
  }
  const params = rest[0] ? JSON.parse(readFileSync(rest[0], 'utf8')) : {}
  const client = new ControlClient({
    url: process.env.AB_CONTROL_URL,
    tokenFile: process.env.AB_CONTROL_TOKEN_FILE
  })
  console.log(JSON.stringify(await client.call(command, params)))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: publicError(error) }))
    process.exitCode = 1
  })
}
