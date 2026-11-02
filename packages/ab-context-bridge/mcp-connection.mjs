import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { OrcaStdioTransport } from './stdio-transport.mjs'
import { LIMITS } from './contracts.mjs'
import { ContextBridgeError, connectionError, requireCondition } from './errors.mjs'

function boundedFetch(fetcher) {
  return async (url, options) => {
    const response = await fetcher(url, { ...options, redirect: 'error' })
    if (!response.body) {
      return response
    }
    const reader = response.body.getReader()
    let bytes = 0
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            return
          }
          bytes += value.byteLength
          if (bytes > LIMITS.messageBytes) {
            await reader.cancel()
            controller.error(
              new ContextBridgeError(
                'RESPONSE_TOO_LARGE',
                'The MCP HTTP response exceeds the byte limit.'
              )
            )
          } else {
            controller.enqueue(value)
          }
        } catch (error) {
          controller.error(error)
        }
      },
      cancel(reason) {
        return reader.cancel(reason)
      }
    })
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
  }
}

export async function connectConfiguredMcp(
  configuration,
  { signal, timeoutMs = 30000, environment = process.env, fetcher = globalThis.fetch } = {}
) {
  requireCondition(
    configuration && typeof configuration === 'object',
    'INVALID_CONFIGURATION',
    'An explicit MCP transport configuration is required.'
  )
  requireCondition(
    Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 120000,
    'INVALID_CONFIGURATION',
    'timeoutMs must be 1–120000.'
  )
  let transport
  if (configuration.type === 'stdio') {
    requireCondition(
      typeof configuration.command === 'string' && path.isAbsolute(configuration.command),
      'INVALID_CONFIGURATION',
      'The MCP command must be an absolute executable path.'
    )
    requireCondition(
      Array.isArray(configuration.args) &&
        configuration.args.every((arg) => typeof arg === 'string'),
      'INVALID_CONFIGURATION',
      'MCP args must be an array of strings.'
    )
    requireCondition(
      configuration.cwd === undefined || path.isAbsolute(configuration.cwd),
      'INVALID_CONFIGURATION',
      'MCP cwd must be absolute.'
    )
    const env = { ...getDefaultEnvironment() }
    for (const [key, value] of Object.entries(configuration.env ?? {})) {
      requireCondition(
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) &&
          typeof value === 'string' &&
          !['NODE_OPTIONS', 'NODE_PATH'].includes(key),
        'INVALID_CONFIGURATION',
        'Invalid MCP environment field.'
      )
      env[key] = value
    }
    for (const [key, reference] of Object.entries(configuration.envFromEnvironment ?? {})) {
      requireCondition(
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) &&
          !['NODE_OPTIONS', 'NODE_PATH'].includes(key) &&
          typeof reference === 'string' &&
          typeof environment[reference] === 'string',
        'MISSING_CREDENTIAL',
        'A configured MCP environment reference is unavailable.'
      )
      env[key] = environment[reference]
    }
    transport = new OrcaStdioTransport({
      program: configuration.command,
      args: configuration.args,
      cwd: configuration.cwd,
      env
    })
  } else if (configuration.type === 'streamable-http') {
    let url
    try {
      url = new URL(configuration.url)
    } catch {
      throw new ContextBridgeError('INVALID_CONFIGURATION', 'The MCP URL is invalid.')
    }
    requireCondition(
      !url.username &&
        !url.password &&
        !url.hash &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))),
      'INVALID_CONFIGURATION',
      'Use HTTPS or loopback HTTP without credentials in the URL.'
    )
    const headers = {}
    for (const [name, reference] of Object.entries(configuration.headersFromEnvironment ?? {})) {
      requireCondition(
        /^[A-Za-z0-9-]+$/.test(name) &&
          !['host', 'content-length', 'content-type', 'accept', 'connection'].includes(
            name.toLowerCase()
          ) &&
          typeof reference === 'string' &&
          typeof environment[reference] === 'string',
        'MISSING_CREDENTIAL',
        'A configured MCP header reference is unavailable.'
      )
      headers[name] = environment[reference]
    }
    transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers, redirect: 'error' },
      fetch: boundedFetch(fetcher),
      reconnectionOptions: {
        maxRetries: 0,
        initialReconnectionDelay: 1000,
        maxReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1
      }
    })
  } else {
    throw new ContextBridgeError(
      'INVALID_CONFIGURATION',
      'Use stdio or streamable-http; no endpoint is inferred.'
    )
  }
  const client = new Client({ name: 'ab-brainmaster-context-bridge', version: '0.1.0' })
  try {
    await client.connect(transport, {
      timeout: timeoutMs,
      maxTotalTimeout: timeoutMs,
      ...(signal ? { signal } : {})
    })
    return { client, close: () => client.close() }
  } catch (error) {
    await client.close().catch(() => {})
    throw connectionError(error, 'initialize')
  }
}
