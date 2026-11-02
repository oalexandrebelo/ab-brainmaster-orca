import { createServer } from 'node:http'
import {
  CONTRACT_VERSION,
  LIMITS,
  ControlError,
  publicError,
  validateOperation
} from './contract.mjs'
import { readToken, tokenMatches } from './credentials.mjs'
import { createRuntimeClient } from './runtime-adapter.ts'

function send(response, status, body) {
  if (response.destroyed) {
    return
  }
  const wire = JSON.stringify(body)
  if (Buffer.byteLength(wire) > LIMITS.responseBytes) {
    return send(response, 502, {
      ok: false,
      error: { code: 'response_too_large', message: 'Runtime response exceeds the control limit.' }
    })
  }
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  })
  response.end(wire)
}

async function readBody(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw new ControlError('content_type', 'Use application/json.', 415)
  }
  if (request.headers['content-encoding']) {
    throw new ControlError('content_encoding', 'Compressed requests are unsupported.', 415)
  }
  if (Number(request.headers['content-length'] ?? 0) > LIMITS.bodyBytes) {
    throw new ControlError('body_too_large', 'Request body exceeds the limit.', 413)
  }
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > LIMITS.bodyBytes) {
      throw new ControlError('body_too_large', 'Request body exceeds the limit.', 413)
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ControlError('invalid_json', 'Request body must be valid JSON.')
  }
}

export async function createControlServer({
  profile,
  pairingFile,
  tokenFile,
  port = 0,
  host = '127.0.0.1',
  container = false,
  publishedPort,
  maxInFlight = LIMITS.inFlight,
  timeoutMs = LIMITS.timeoutMs
}) {
  if (
    !['127.0.0.1', '::1'].includes(host) &&
    !(
      container === true &&
      host === '0.0.0.0' &&
      Number.isInteger(publishedPort) &&
      publishedPort > 0 &&
      publishedPort <= 65535
    )
  ) {
    throw new ControlError(
      'invalid_host',
      'Wildcard binding requires explicit container mode and a loopback published port.'
    )
  }
  if (
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    !Number.isInteger(maxInFlight) ||
    maxInFlight < 1 ||
    maxInFlight > 16 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30000
  ) {
    throw new ControlError('invalid_config', 'Invalid port, timeout, or concurrency limit.')
  }
  if (typeof profile !== 'string' || !profile) {
    throw new ControlError('invalid_config', 'An explicit runtime profile is required.')
  }
  readToken(tokenFile)
  const runtime = createRuntimeClient({ profile, pairingFile, timeoutMs })
  let inFlight = 0
  let closing = false
  let authority
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 5000 },
    async (request, response) => {
      let acquired = false
      try {
        if (closing) {
          throw new ControlError('closing', 'Control server is stopping.', 503)
        }
        if (
          request.headers.host !== authority &&
          !(container && request.headers.host === `127.0.0.1:${publishedPort}`)
        ) {
          throw new ControlError('invalid_host', 'Unexpected Host header.', 403)
        }
        if (
          request.headers.origin !== undefined ||
          request.headers['sec-fetch-site'] === 'cross-site'
        ) {
          throw new ControlError(
            'origin_denied',
            'Browser origins are not enabled on this API.',
            403
          )
        }
        if (!tokenMatches(request.headers.authorization, readToken(tokenFile))) {
          throw new ControlError('unauthorized', 'A valid bearer credential is required.', 401)
        }
        if (request.method !== 'POST' || !/^\/v1\/[a-z_]+$/.test(request.url ?? '')) {
          throw new ControlError('not_found', 'Use a documented POST /v1/operation endpoint.', 404)
        }
        if (inFlight >= maxInFlight) {
          throw new ControlError('busy', 'Concurrent request limit reached.', 429)
        }
        inFlight += 1
        acquired = true
        const body = await readBody(request)
        const { method, params } = validateOperation(request.url.slice(4), body)
        if (response.destroyed) {
          return
        }
        const result = await runtime.call(method, params, { timeoutMs })
        send(response, 200, {
          ok: true,
          contractVersion: CONTRACT_VERSION,
          result: result.result,
          runtimeId: result._meta?.runtimeId ?? null
        })
      } catch (error) {
        const safe =
          error?.code === 'timeout'
            ? new ControlError('timeout', 'The runtime observation reached its time limit.', 504)
            : error
        send(response, safe instanceof ControlError ? safe.status : 502, {
          ok: false,
          error: publicError(safe)
        })
      } finally {
        if (acquired) {
          inFlight -= 1
        }
      }
    }
  )
  server.maxRequestsPerSocket = 100
  server.maxConnections = maxInFlight + 16
  server.keepAliveTimeout = 1000
  server.setTimeout(10000, (socket) => socket.destroy())
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolve)
  })
  const address = server.address()
  authority = `${host === '::1' ? '[::1]' : '127.0.0.1'}:${address.port}`
  return {
    url: `http://${authority}`,
    get inFlight() {
      return inFlight
    },
    async close() {
      closing = true
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  }
}
