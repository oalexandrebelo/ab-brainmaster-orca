import { createHash, createHmac, randomBytes } from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, isAbsolute, join, normalize } from 'node:path'
import {
  AGENT_SESSION_CLAIM_DIGEST_VERSION,
  type AgentSessionExecutionClaim
} from '../../../../shared/agent-session/agent-session-host-authority'
import { getAgentResumeArgv } from '../../../../shared/agent-resume-argv'
import { fsyncFileSync } from '../../../../shared/secure-file'
import { publishFileWithoutOverwrite } from '../../../codex-accounts/fs-utils'
import {
  isResumableTuiAgent,
  normalizeAgentProviderSession,
  type AgentProviderSessionMetadata,
  type ResumableTuiAgent
} from '../../../../shared/agent-session/lifecycle/agent-session-resume'

const COORDINATION_KEY_BYTES = 32
const COORDINATION_KEY_FILE = 'agent-session-authority.key'
const TRANSCRIPT_PATH_MAX_BYTES = 16 * 1024

export type ProviderExecutionNamespace = {
  machine: string
  principal: string
  container: string
  providerRoot: string
}

export type CanonicalAgentSessionIdentity = {
  agent: ResumableTuiAgent
  providerSession: AgentProviderSessionMetadata
}

function encodeFields(fields: readonly string[]): Buffer {
  const chunks: Buffer[] = []
  for (const field of fields) {
    const value = Buffer.from(field, 'utf8')
    const length = Buffer.allocUnsafe(4)
    length.writeUInt32BE(value.length)
    chunks.push(length, value)
  }
  return Buffer.concat(chunks)
}

function canonicalPathForPlatform(value: string): string {
  const canonical = normalize(realpathSync(value))
  return process.platform === 'win32' ? canonical.toLocaleLowerCase('en-US') : canonical
}

export function canonicalizeAgentSessionIdentity(
  agent: unknown,
  rawProviderSession: unknown
): CanonicalAgentSessionIdentity {
  if (!isResumableTuiAgent(agent)) {
    throw new Error('agent_session_identity_required')
  }
  const providerSession = normalizeAgentProviderSession(rawProviderSession)
  if (!providerSession || !getAgentResumeArgv(agent, providerSession)) {
    throw new Error('agent_session_identity_required')
  }
  if (agent !== 'pi' && agent !== 'prime-agent') {
    return { agent, providerSession }
  }
  const transcriptPath = providerSession.transcriptPath
  if (
    !transcriptPath ||
    !isAbsolute(transcriptPath) ||
    Buffer.byteLength(transcriptPath, 'utf8') > TRANSCRIPT_PATH_MAX_BYTES
  ) {
    throw new Error('agent_session_identity_required')
  }
  const canonicalTranscriptPath = canonicalPathForPlatform(transcriptPath)
  if (!statSync(canonicalTranscriptPath).isFile()) {
    throw new Error('agent_session_identity_required')
  }
  return {
    agent,
    providerSession: { ...providerSession, transcriptPath: canonicalTranscriptPath }
  }
}

export class AgentSessionClaimSigner {
  readonly keyId: string

  constructor(
    private readonly authorityDomainId: string,
    private readonly key: Buffer
  ) {
    if (key.length !== COORDINATION_KEY_BYTES) {
      throw new Error('agent_session_ownership_unknown')
    }
    this.keyId = createHash('sha256').update(key).digest('base64url').slice(0, 22)
  }

  createClaim(args: {
    namespace: ProviderExecutionNamespace
    identity: CanonicalAgentSessionIdentity
    canonicalWorktreeId: string
  }): AgentSessionExecutionClaim {
    const namespaceFields = [
      args.namespace.machine,
      args.namespace.principal,
      args.namespace.container,
      args.namespace.providerRoot
    ]
    const identityFields = [
      'orca-agent-session-claim-v1',
      this.authorityDomainId,
      ...namespaceFields,
      args.identity.agent,
      args.identity.providerSession.key,
      args.identity.providerSession.id,
      args.identity.agent === 'pi' || args.identity.agent === 'prime-agent'
        ? (args.identity.providerSession.transcriptPath ?? '')
        : ''
    ]
    const worktreeFields = [
      'orca-agent-session-worktree-v1',
      this.authorityDomainId,
      ...namespaceFields,
      args.canonicalWorktreeId
    ]
    return {
      digestVersion: AGENT_SESSION_CLAIM_DIGEST_VERSION,
      keyId: this.keyId,
      identityDigest: createHmac('sha256', this.key)
        .update(encodeFields(identityFields))
        .digest('base64url'),
      worktreeScopeDigest: createHmac('sha256', this.key)
        .update(encodeFields(worktreeFields))
        .digest('base64url'),
      agent: args.identity.agent
    }
  }
}

export function loadAgentSessionClaimSigner(
  profileDirectory: string,
  authorityDomainId: string
): AgentSessionClaimSigner {
  const keyPath = join(profileDirectory, COORDINATION_KEY_FILE)
  mkdirSync(dirname(keyPath), { recursive: true, mode: 0o700 })
  let key: Buffer
  try {
    key = readFileSync(keyPath)
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
    const temporaryPath = `${keyPath}.${process.pid}.${randomBytes(16).toString('hex')}.tmp`
    const descriptor = openSync(temporaryPath, 'wx', 0o600)
    try {
      try {
        writeFileSync(descriptor, randomBytes(COORDINATION_KEY_BYTES))
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
      syncClaimKeyDirectories(profileDirectory)
      publishFileWithoutOverwrite(temporaryPath, keyPath)
    } finally {
      unlinkSync(temporaryPath)
    }
    key = readFileSync(keyPath)
  }
  // Replacing a corrupt key would make surviving ownership incomparable; refuse authority instead.
  if (key.length !== COORDINATION_KEY_BYTES) {
    throw new Error('agent_session_ownership_unknown')
  }
  // A concurrent creator can publish before its directory sync; readers complete that fence too.
  fsyncFileSync(keyPath)
  syncClaimKeyDirectories(profileDirectory)
  return new AgentSessionClaimSigner(authorityDomainId, key)
}

function syncClaimKeyDirectories(profileDirectory: string): void {
  if (process.platform === 'win32') {
    return
  }
  let directory = realpathSync(profileDirectory)
  const device = statSync(directory).dev
  for (;;) {
    const descriptor = openSync(directory, 'r')
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    const parent = dirname(directory)
    if (parent === directory || statSync(parent).dev !== device) {
      return
    }
    directory = parent
  }
}

export function createEphemeralAgentSessionClaimSigner(
  authorityDomainId: string
): AgentSessionClaimSigner {
  return new AgentSessionClaimSigner(authorityDomainId, randomBytes(COORDINATION_KEY_BYTES))
}
