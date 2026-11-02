export class ContextBridgeError extends Error {
  constructor(code, message, details = {}, options) {
    super(message, options)
    this.name = 'ContextBridgeError'
    this.code = code
    this.details = details
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details }
  }
}

export function requireCondition(condition, code, message) {
  if (!condition) {
    throw new ContextBridgeError(code, message)
  }
}

export function connectionError(error, operation) {
  if (error instanceof ContextBridgeError) {
    return error
  }
  const remoteCode = error?.code
  const code =
    error?.name === 'AbortError'
      ? 'CANCELLED'
      : remoteCode === -32001 || error?.name === 'TimeoutError'
        ? 'TIMEOUT'
        : remoteCode === 401 || error?.name === 'UnauthorizedError'
          ? 'AUTHENTICATION_REQUIRED'
          : remoteCode === 403
            ? 'FORBIDDEN'
            : remoteCode === -32602
              ? 'CONTRACT_INCOMPATIBLE'
              : 'CONNECTION_UNAVAILABLE'
  return new ContextBridgeError(
    code,
    `MCP operation ${operation} failed.`,
    {
      operation,
      ...(typeof remoteCode === 'number' ? { rpcCode: remoteCode } : {})
    },
    { cause: error }
  )
}

export function unwrapToolResult(result, operation) {
  let value = result?.structuredContent
  if (value === undefined) {
    const content = result?.content
    requireCondition(
      Array.isArray(content) && content.length === 1 && content[0].type === 'text',
      'MALFORMED_RESPONSE',
      `Expected one JSON object from ${operation}.`
    )
    try {
      value = JSON.parse(content[0].text)
    } catch {
      throw new ContextBridgeError('MALFORMED_RESPONSE', `Invalid JSON from ${operation}.`)
    }
  }
  requireCondition(
    value && typeof value === 'object' && !Array.isArray(value),
    'MALFORMED_RESPONSE',
    `Expected an object from ${operation}.`
  )
  if (result.isError || value.ok === false || typeof value.error === 'string') {
    const code =
      typeof value.error === 'string'
        ? value.error
        : typeof value.code === 'string'
          ? value.code
          : 'REMOTE_ERROR'
    const message = value.detail ?? value.message ?? code
    throw new ContextBridgeError(code, typeof message === 'string' ? message : code, {
      operation,
      origin: 'remote'
    })
  }
  if (value.ok === true) {
    requireCondition(
      value.data && typeof value.data === 'object' && !Array.isArray(value.data),
      'MALFORMED_RESPONSE',
      `Missing data from ${operation}.`
    )
    return value.data
  }
  return value
}
