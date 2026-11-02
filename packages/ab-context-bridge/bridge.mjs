import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv'
import {
  LIMITS,
  identifier,
  queryBudget,
  readWindow,
  sha256,
  validateBinding,
  verifyProject
} from './contracts.mjs'
import {
  ContextBridgeError,
  connectionError,
  requireCondition,
  unwrapToolResult
} from './errors.mjs'
import { buildEvidencePack, validateRead, validateSelection } from './evidence-pack.mjs'

export { ContextBridgeError } from './errors.mjs'
export { buildEvidencePack, countContextTokens } from './evidence-pack.mjs'

export function createContextBridge({
  client,
  kind,
  connectionId,
  binding: inputBinding,
  timeoutMs = 30000
}) {
  requireCondition(
    ['bbrainx', 'ab-s00s'].includes(kind),
    'INVALID_ARGUMENT',
    'Choose the bbrainx or ab-s00s contract explicitly.'
  )
  requireCondition(
    typeof connectionId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(connectionId),
    'INVALID_ARGUMENT',
    'connectionId must be a nonsecret local identifier.'
  )
  requireCondition(
    client && typeof client.listTools === 'function' && typeof client.callTool === 'function',
    'INVALID_ARGUMENT',
    'A connected MCP client is required.'
  )
  requireCondition(
    Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 120000,
    'INVALID_ARGUMENT',
    'timeoutMs must be 1–120000.'
  )
  const binding = validateBinding(inputBinding)
  const validators = new Map()
  let discovery
  let discoveryPending
  const options = (signal) => ({
    timeout: timeoutMs,
    maxTotalTimeout: timeoutMs,
    ...(signal ? { signal } : {})
  })
  const provider = new AjvJsonSchemaValidator()

  async function invoke(name, args, signal) {
    requireCondition(!signal?.aborted, 'CANCELLED', 'Context retrieval was cancelled.')
    requireCondition(
      validators.has(name),
      'CONTRACT_INCOMPATIBLE',
      `Required MCP tool ${name} is unavailable.`
    )
    requireCondition(
      validators.get(name)(args).valid,
      'CONTRACT_INCOMPATIBLE',
      `Arguments do not match the advertised ${name} schema.`
    )
    try {
      const result = await client.callTool({ name, arguments: args }, undefined, options(signal))
      requireCondition(
        Buffer.byteLength(JSON.stringify(result)) <= LIMITS.messageBytes,
        'RESPONSE_TOO_LARGE',
        'MCP response exceeds the adapter byte limit.'
      )
      return unwrapToolResult(result, name)
    } catch (error) {
      throw connectionError(error, name)
    }
  }

  async function indexStatus(signal) {
    const status = await invoke(
      'context_index',
      { project: binding.projectId, mode: 'status' },
      signal
    )
    verifyProject(status, binding, status.root)
    requireCondition(
      ['current', 'missing', 'stale'].includes(status.status) && typeof status.root === 'string',
      'MALFORMED_RESPONSE',
      'Invalid BBrainX index status.'
    )
    return status
  }

  async function projectScope(signal) {
    const result = await invoke('projects', {}, signal)
    requireCondition(
      Array.isArray(result.projects) &&
        result.projects.every(
          (item) => typeof item?.id === 'string' && typeof item?.root === 'string'
        ),
      'MALFORMED_RESPONSE',
      'The project catalog is malformed.'
    )
    const project = result.projects.find((item) => item.id === binding.projectId)
    requireCondition(
      project,
      'PROJECT_NOT_AVAILABLE',
      'The configured project is absent from the connection catalog.'
    )
    verifyProject({ project: project.id }, binding, project.root)
    return { projectId: project.id, root: project.root }
  }

  async function discover({ signal } = {}) {
    requireCondition(!signal?.aborted, 'CANCELLED', 'Context discovery was cancelled.')
    if (discovery) {
      return structuredClone(discovery)
    }
    if (discoveryPending) {
      return discoveryPending
    }
    discoveryPending = (async () => {
      const catalog = []
      const cursors = new Set()
      let cursor
      do {
        let page
        try {
          page = await client.listTools(cursor ? { cursor } : {}, options(signal))
        } catch (error) {
          throw connectionError(error, 'tools/list')
        }
        requireCondition(
          Array.isArray(page.tools),
          'MALFORMED_RESPONSE',
          'MCP tools/list returned no catalog.'
        )
        catalog.push(...page.tools)
        requireCondition(
          catalog.length <= LIMITS.catalogTools && cursors.size < 8,
          'CATALOG_TOO_LARGE',
          'The MCP tool catalog exceeds the adapter limit.'
        )
        cursor = page.nextCursor
        requireCondition(
          cursor === undefined || (typeof cursor === 'string' && !cursors.has(cursor)),
          'MALFORMED_RESPONSE',
          'The tool catalog repeated an invalid cursor.'
        )
        if (cursor) {
          cursors.add(cursor)
        }
      } while (cursor)
      const required =
        kind === 'bbrainx'
          ? ['context_index', 'context_bootstrap', 'context_read']
          : ['projects', 'search', 'read']
      const names = new Set()
      for (const tool of catalog) {
        requireCondition(
          typeof tool.name === 'string' && !names.has(tool.name),
          'CONTRACT_INCOMPATIBLE',
          'The MCP tool catalog has invalid or duplicate names.'
        )
        names.add(tool.name)
        if (!required.includes(tool.name)) {
          continue
        }
        requireCondition(
          tool.inputSchema?.type === 'object',
          'CONTRACT_INCOMPATIBLE',
          `Missing input schema for ${tool.name}.`
        )
        try {
          validators.set(tool.name, provider.getValidator(tool.inputSchema))
        } catch {
          throw new ContextBridgeError(
            'CONTRACT_INCOMPATIBLE',
            `Unsupported input schema for ${tool.name}.`
          )
        }
      }
      for (const name of required) {
        requireCondition(
          validators.has(name),
          'CONTRACT_INCOMPATIBLE',
          `Missing ${name} capability.`
        )
      }
      const scope = kind === 'bbrainx' ? await indexStatus(signal) : await projectScope(signal)
      discovery = {
        connectionId,
        kind,
        binding: structuredClone(binding),
        server: client.getServerVersion?.()
          ? {
              name: client.getServerVersion().name,
              version: client.getServerVersion().version
            }
          : null,
        catalogHash: sha256(
          JSON.stringify(
            catalog.map(({ name, inputSchema, outputSchema }) => ({
              name,
              inputSchema,
              outputSchema
            }))
          )
        ),
        tools: required,
        scope
      }
      return structuredClone(discovery)
    })()
    try {
      return await discoveryPending
    } finally {
      discoveryPending = undefined
    }
  }

  async function retrieve({ query, budget = 3000, task, windows = [], signal } = {}) {
    queryBudget(query, budget)
    requireCondition(
      Array.isArray(windows) && windows.length <= LIMITS.windows,
      'INVALID_ARGUMENT',
      'Use at most eight read windows.'
    )
    const requests = windows.map(readWindow)
    if (task !== undefined) {
      identifier(task, 'task')
      requireCondition(
        kind === 'bbrainx',
        'CONTRACT_INCOMPATIBLE',
        'AB-S00S search does not expose task checkpoints.'
      )
    }
    await discover({ signal })
    if (kind === 'bbrainx') {
      const status = await indexStatus(signal)
      requireCondition(
        status.status !== 'missing',
        'INDEX_REQUIRED',
        'BBrainX has no index; refresh it explicitly in BBrainX.'
      )
      requireCondition(
        status.status === 'current',
        'INDEX_STALE',
        'BBrainX index differs from the registered files; refresh it explicitly in BBrainX.'
      )
    } else {
      await projectScope(signal)
    }
    const args = { project: binding.projectId, query, budget, ...(task ? { task } : {}) }
    const selection = await invoke(
      kind === 'bbrainx' ? 'context_bootstrap' : 'search',
      args,
      signal
    )
    const verifiedBinding = { ...binding, expectedRoot: discovery.scope.root }
    validateSelection(selection, kind, verifiedBinding, budget)
    const reads = []
    for (const request of requests) {
      requireCondition(
        (selection.sources ?? selection.items).some((source) => source.path === request.path),
        'SOURCE_NOT_SELECTED',
        'Read windows must refer to a source selected for this task.'
      )
      const response = await invoke(
        kind === 'bbrainx' ? 'context_read' : 'read',
        { project: binding.projectId, ...request },
        signal
      )
      validateRead(response, request, selection, verifiedBinding)
      reads.push({ request, response })
    }
    return buildEvidencePack({
      kind,
      connectionId,
      server: discovery.server,
      binding: verifiedBinding,
      query,
      budget,
      selection,
      reads,
      discovery
    })
  }
  return Object.freeze({ discover, retrieve })
}
