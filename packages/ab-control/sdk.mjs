import { ControlError, LIMITS, validateOperation } from './contract.mjs'
import { readToken } from './credentials.mjs'

export class ControlClient {
  constructor({ url, tokenFile, timeoutMs = LIMITS.timeoutMs }) {
    const parsed = new URL(url)
    if (
      parsed.protocol !== 'http:' ||
      !['127.0.0.1', '[::1]'].includes(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      throw new ControlError(
        'invalid_url',
        'Use an HTTP loopback URL without credentials or paths.'
      )
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
      throw new ControlError('invalid_timeout', 'Timeout must be 100–30000 milliseconds.')
    }
    this.url = parsed.origin
    this.tokenFile = tokenFile
    this.timeoutMs = timeoutMs
  }

  async call(operation, params = {}, { signal } = {}) {
    validateOperation(operation, params)
    signal?.throwIfAborted()
    const response = await fetch(`${this.url}/v1/${operation}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${readToken(this.tokenFile)}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(params),
      signal: AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])])
    })
    let size = 0
    const chunks = []
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > LIMITS.responseBytes) {
        throw new ControlError('response_too_large', 'Control response exceeds the limit.', 502)
      }
      chunks.push(chunk)
    }
    let body
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw new ControlError('invalid_response', 'Control server returned invalid JSON.', 502)
    }
    if (!response.ok || body.ok !== true) {
      throw new ControlError(
        body.error?.code ?? 'request_failed',
        body.error?.message ?? 'Control request failed.',
        response.status
      )
    }
    if (body.contractVersion !== 1) {
      throw new ControlError('contract_mismatch', 'Unsupported control contract.', 502)
    }
    return body
  }
}
