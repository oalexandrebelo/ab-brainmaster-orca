export const CONTRACT_VERSION = 1
export const LIMITS = Object.freeze({
  bodyBytes: 16384,
  responseBytes: 4 * 1024 * 1024,
  inFlight: 4,
  timeoutMs: 15000
})
const selector = { type: 'string', minLength: 1, maxLength: 4096 }
const limit = { type: 'integer', minimum: 1, maximum: 200 }
const operation = (method, description, properties = {}, required = []) =>
  Object.freeze({
    method,
    description,
    inputSchema: { type: 'object', properties, required, additionalProperties: false }
  })

export const OPERATIONS = Object.freeze({
  status: operation('status.get', 'Read runtime identity, readiness and capabilities.'),
  repos: operation('repo.list', 'List registered repositories.'),
  workspaces: operation('worktree.list', 'List managed Git workspaces.', { repo: selector, limit }),
  folders: operation(
    'folderWorkspace.list',
    'List folder workspaces, including folders without Git.'
  ),
  terminals: operation('terminal.list', 'List terminal handles without output previews.', {
    worktree: selector,
    limit
  }),
  terminal_read: operation(
    'terminal.read',
    'Read a bounded terminal output page.',
    {
      terminal: selector,
      cursor: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      limit
    },
    ['terminal']
  ),
  terminal_wait: operation(
    'terminal.wait',
    'Wait up to five seconds for an existing terminal to exit.',
    {
      terminal: selector,
      timeoutMs: { type: 'integer', minimum: 1, maximum: 5000 }
    },
    ['terminal']
  )
})

export class ControlError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'ControlError'
    this.code = code
    this.status = status
  }
}

export function validateOperation(name, input = {}) {
  if (!Object.hasOwn(OPERATIONS, name)) {
    throw new ControlError('unknown_operation', 'Unknown control operation.', 404)
  }
  const operation = OPERATIONS[name]
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ControlError('invalid_params', 'Parameters must be an object.')
  }
  const schema = operation.inputSchema
  for (const field of schema.required) {
    if (!(field in input)) {
      throw new ControlError('invalid_params', `Missing ${field}.`)
    }
  }
  for (const [field, value] of Object.entries(input)) {
    const rule = schema.properties[field]
    if (!rule) {
      throw new ControlError('invalid_params', `Unknown parameter ${field}.`)
    }
    const valid =
      rule.type === 'string'
        ? typeof value === 'string' &&
          value.length >= rule.minLength &&
          value.length <= rule.maxLength &&
          !value.includes('\0')
        : Number.isSafeInteger(value) && value >= rule.minimum && value <= rule.maximum
    if (!valid) {
      throw new ControlError('invalid_params', `Invalid ${field}.`)
    }
  }
  const params = { ...input }
  if ('limit' in schema.properties) {
    params.limit ??= 100
  }
  if (name === 'terminals') {
    Object.assign(params, { includePreview: false, includeVisualLayouts: false })
  }
  if (name === 'terminal_wait') {
    Object.assign(params, { for: 'exit', timeoutMs: params.timeoutMs ?? 1000 })
  }
  return { method: operation.method, params }
}

export function publicError(error) {
  if (error instanceof ControlError) {
    return { code: error.code, message: error.message }
  }
  return {
    code: 'runtime_unavailable',
    message: 'The runtime request failed; inspect the local runtime diagnostics.'
  }
}
