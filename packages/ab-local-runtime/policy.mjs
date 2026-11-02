import { createHash } from 'node:crypto'
import path from 'node:path'

export class LocalRuntimeError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'LocalRuntimeError'
    this.code = code
  }

  toJSON() {
    return { code: this.code, message: this.message }
  }
}

export function requireValue(value, code, message) {
  if (!value) {
    throw new LocalRuntimeError(code, message)
  }
}

export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const QWEN_PROFILE = Object.freeze({
  id: 'qwen3-0.6b-q4km-byte-bpe-v1',
  digest: '7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435',
  templateSha256: 'ae370d884f108d16e7cc8fd5259ebc5773a0afa6e078b11f4ed7e39a27e0dfc4',
  tokenizerModel: 'gpt2',
  tokenizerPre: 'qwen2',
  templateTokenReserve: 2048
})
const MODEL_PROFILES = [
  QWEN_PROFILE,
  Object.freeze({
    ...QWEN_PROFILE,
    id: 'qwen3-1.7b-q4km-byte-bpe-v1',
    digest: '8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7'
  })
]

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function integer(value, fallback, min, max, name) {
  const result = value ?? fallback
  requireValue(
    Number.isInteger(result) && result >= min && result <= max,
    'INVALID_CONFIGURATION',
    `${name} must be an integer from ${min} to ${max}.`
  )
  return result
}

export function loopbackEndpoint(value, { allowPath = false } = {}) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new LocalRuntimeError(
      'INVALID_CONFIGURATION',
      'An explicit loopback endpoint is required.'
    )
  }
  requireValue(
    ['http:', 'https:'].includes(url.protocol) &&
      ['127.0.0.1', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      (allowPath || url.pathname === '/'),
    'INVALID_CONFIGURATION',
    'Use a numeric loopback HTTP(S) origin without credentials, query, path or fragment.'
  )
  return url.origin
}

export function normalizeConfig(input) {
  requireValue(
    input && typeof input === 'object',
    'INVALID_CONFIGURATION',
    'Configuration is required.'
  )
  requireValue(
    typeof input.stateDirectory === 'string' && path.isAbsolute(input.stateDirectory),
    'INVALID_CONFIGURATION',
    'stateDirectory must be an absolute local directory.'
  )
  requireValue(
    input.provider === 'ollama',
    'INVALID_CONFIGURATION',
    'Only the explicit ollama provider is supported.'
  )
  const endpoint = loopbackEndpoint(input.endpoint)
  const model = input.model
  requireValue(
    typeof model === 'string' &&
      /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model) &&
      Array.isArray(input.allowedModels) &&
      input.allowedModels.length <= 32 &&
      input.allowedModels.every(
        (item) => typeof item?.name === 'string' && /^[a-f0-9]{64}$/.test(item.digest)
      ) &&
      input.allowedModels.filter((item) => item.name === model).length === 1,
    'INVALID_CONFIGURATION',
    'The selected model must appear once in allowedModels with a full SHA-256 digest.'
  )
  requireValue(
    input.concurrency === undefined || input.concurrency === 1,
    'INVALID_CONFIGURATION',
    'This runtime admits one task at a time.'
  )
  const modelProfile = MODEL_PROFILES.find(
    (profile) => profile.digest === input.allowedModels.find((item) => item.name === model).digest
  )
  requireValue(
    modelProfile,
    'MODEL_PROFILE_UNSUPPORTED',
    'This release supports audited Qwen3 0.6B/1.7B profiles only; another tokenizer/template needs its own verified budget policy.'
  )
  const limits = {
    timeoutMs: integer(input.limits?.timeoutMs, 120000, 100, 600000, 'timeoutMs'),
    maxPromptBytes: integer(input.limits?.maxPromptBytes, 32768, 1024, 131072, 'maxPromptBytes'),
    maxOutputBytes: integer(input.limits?.maxOutputBytes, 32768, 64, 131072, 'maxOutputBytes'),
    maxOutputTokens: integer(input.limits?.maxOutputTokens, 512, 16, 4096, 'maxOutputTokens'),
    templateTokenReserve: integer(
      input.limits?.templateTokenReserve,
      QWEN_PROFILE.templateTokenReserve,
      QWEN_PROFILE.templateTokenReserve,
      8192,
      'templateTokenReserve'
    ),
    contextWindowTokens: integer(
      input.limits?.contextWindowTokens,
      8192,
      1024,
      32768,
      'contextWindowTokens'
    ),
    numThreads: integer(input.limits?.numThreads, 2, 1, 16, 'numThreads')
  }
  requireValue(
    limits.maxOutputTokens + limits.templateTokenReserve + 1024 <= limits.contextWindowTokens,
    'INVALID_CONFIGURATION',
    'Reserve template, output and at least 1024 input bytes within the context window.'
  )
  if (input.contextBridge !== undefined) {
    requireValue(
      input.contextBridge &&
        typeof input.contextBridge === 'object' &&
        ['bbrainx', 'ab-s00s'].includes(input.contextBridge.kind) &&
        input.contextBridge.transport &&
        input.contextBridge.binding,
      'INVALID_CONFIGURATION',
      'contextBridge requires a kind, transport and explicit workspace/project binding.'
    )
    const transport = input.contextBridge.transport
    requireValue(
      transport.type === 'stdio' ||
        (transport.type === 'streamable-http' &&
          loopbackEndpoint(transport.url, { allowPath: true })),
      'INVALID_CONFIGURATION',
      'Local context uses stdio or a numeric loopback MCP origin.'
    )
  }
  return {
    stateDirectory: path.resolve(input.stateDirectory),
    provider: 'ollama',
    endpoint,
    model,
    modelProfile: { ...modelProfile },
    allowedModels: structuredClone(input.allowedModels),
    concurrency: 1,
    limits,
    ...(input.contextBridge ? { contextBridge: structuredClone(input.contextBridge) } : {})
  }
}

export function normalizeRequest(input, config) {
  requireValue(
    input && typeof input === 'object',
    'INVALID_ARGUMENT',
    'A task request is required.'
  )
  requireValue(
    typeof input.idempotencyKey === 'string' &&
      input.idempotencyKey.length >= 1 &&
      Buffer.byteLength(input.idempotencyKey) <= 256,
    'INVALID_ARGUMENT',
    'idempotencyKey must contain 1–256 bytes.'
  )
  requireValue(
    typeof input.task === 'string' &&
      input.task.trim().length > 0 &&
      Buffer.byteLength(input.task) <= Math.min(16384, config.limits.maxPromptBytes),
    'INVALID_ARGUMENT',
    'The task must be nonempty and fit the configured prompt limit.'
  )
  requireValue(
    !input.context || config.contextBridge,
    'INVALID_ARGUMENT',
    'A context request requires contextBridge configuration.'
  )
  const request = { task: input.task }
  if (config.contextBridge) {
    requireValue(
      input.context &&
        typeof input.context.query === 'string' &&
        input.context.query.trim() &&
        input.context.query.length <= 1000,
      'INVALID_ARGUMENT',
      'Each context-enabled task requires an explicit context query.'
    )
    request.context = {
      query: input.context.query,
      budget: input.context.budget ?? 1200,
      ...(input.context.task ? { task: input.context.task } : {}),
      windows: input.context.windows ?? []
    }
    requireValue(
      Buffer.byteLength(JSON.stringify(request.context)) <= 32768,
      'INVALID_ARGUMENT',
      'Context parameters exceed 32 KiB.'
    )
  }
  return { keyHash: sha256(input.idempotencyKey), request: structuredClone(request) }
}
