import { createHash } from 'node:crypto'
import path from 'node:path'
import { requireCondition } from './errors.mjs'

export const LIMITS = Object.freeze({
  minBudget: 256,
  maxBudget: 16000,
  lines: 400,
  readBytes: 65536,
  windows: 8,
  messageBytes: 262144,
  catalogTools: 256
})
export const sha256 = (value) => createHash('sha256').update(value).digest('hex')
export const isHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

export function identifier(value, label = 'projectId') {
  requireCondition(
    typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value),
    'INVALID_ARGUMENT',
    `${label} must be a valid project or task identifier.`
  )
  return value
}

export function queryBudget(query, budget) {
  requireCondition(
    typeof query === 'string' && query.trim().length > 0 && query.length <= 1000,
    'INVALID_ARGUMENT',
    'query must contain 1–1000 characters.'
  )
  requireCondition(
    Number.isInteger(budget) && budget >= LIMITS.minBudget && budget <= LIMITS.maxBudget,
    'INVALID_BUDGET',
    'budget must be 256–16000 tokens.'
  )
}

export function relativePath(value) {
  requireCondition(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 1024 &&
      !path.posix.isAbsolute(value) &&
      !path.win32.isAbsolute(value) &&
      !/[\\:]/.test(value) &&
      !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
      value.split('/').every((part) => part && part !== '.' && part !== '..'),
    'UNSAFE_PATH',
    'Use a project-relative path without traversal or platform prefixes.'
  )
  requireCondition(
    !/(^|\/)(\.env(?:\..*)?|\.ssh|credentials(?:\..*)?|id_rsa|id_ed25519)(\/|$)|\.(?:pem|key|p12|pfx)$/i.test(
      value
    ),
    'SENSITIVE_PATH',
    'Credential and private-key paths cannot enter a context pack.'
  )
  return value
}

export function readWindow(value) {
  requireCondition(
    value && typeof value === 'object' && !Array.isArray(value),
    'INVALID_ARGUMENT',
    'A read window is required.'
  )
  const sourcePath = relativePath(value.path)
  const start = value.start ?? 1
  const end = value.end ?? start + 199
  requireCondition(
    Number.isSafeInteger(start) &&
      Number.isSafeInteger(end) &&
      start >= 1 &&
      end >= start &&
      end - start + 1 <= LIMITS.lines,
    'INVALID_READ_RANGE',
    'Use an inclusive window of at most 400 lines.'
  )
  return { path: sourcePath, start, end }
}

export function validateBinding(binding) {
  requireCondition(
    binding && typeof binding === 'object',
    'INVALID_ARGUMENT',
    'An explicit workspace/project binding is required.'
  )
  identifier(binding.projectId)
  requireCondition(
    typeof binding.workspaceId === 'string' &&
      binding.workspaceId.length > 0 &&
      binding.workspaceId.length <= 1024,
    'INVALID_ARGUMENT',
    'workspaceId is required.'
  )
  requireCondition(
    binding.hostId === null ||
      (typeof binding.hostId === 'string' &&
        binding.hostId.length > 0 &&
        binding.hostId.length <= 256),
    'INVALID_ARGUMENT',
    'hostId must identify the execution host (or be null for local).'
  )
  requireCondition(
    binding.expectedRoot === undefined ||
      (typeof binding.expectedRoot === 'string' && binding.expectedRoot.length > 0),
    'INVALID_ARGUMENT',
    'expectedRoot must be a nonempty path when provided.'
  )
  return structuredClone(binding)
}

export function verifyProject(data, binding, root) {
  requireCondition(
    data.project === binding.projectId,
    'SCOPE_MISMATCH',
    'The response belongs to a different project.'
  )
  if (binding.expectedRoot !== undefined && root !== undefined) {
    requireCondition(
      root === binding.expectedRoot,
      'SCOPE_MISMATCH',
      'The registered project root differs from the workspace binding.'
    )
  }
}

export function verifyFreshness(data, binding) {
  verifyProject(data, binding, data.freshness?.root)
  requireCondition(isHash(data.snapshot), 'MALFORMED_RESPONSE', 'A SHA-256 snapshot is required.')
  requireCondition(
    data.freshness?.status === 'current' &&
      data.freshness.snapshot === data.snapshot &&
      typeof data.freshness.observedAt === 'string' &&
      typeof data.freshness.root === 'string',
    'UNVERIFIED_CONTEXT',
    'The source did not provide a current hash verification for this snapshot.'
  )
}
