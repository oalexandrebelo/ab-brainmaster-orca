import path from 'node:path'

export const AUDITED_BILI_VERSION = '0.1.212'
export const REQUIRED_ORCA_VERSION = '1.4.248'
export const SUPPORTED_PLATFORMS = new Set(['linux', 'darwin'])

export function absoluteFile(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\0\r\n]/u.test(value)) {
    throw new Error(`${label}: informe um caminho absoluto.`)
  }
  return value
}

export function upstreamUrl(value) {
  const url = new URL(value)
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.includes('/bili/')
  ) {
    throw new Error(
      'Endpoint: use HTTPS ou HTTP de loopback, sem credenciais, query ou outro proxy bili.'
    )
  }
  return url.href.replace(/\/$/u, '')
}

export function normalizeSetup(input, workspace, platform = process.platform) {
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error('Esta integração requer Linux ou macOS local.')
  }
  if (
    !workspace ||
    workspace.id !== input.workspaceId ||
    ![null, 'local'].includes(workspace.hostId)
  ) {
    throw new Error(
      'Escolha um workspace local identificado pelo Orca. SSH e WSL ainda não são suportados.'
    )
  }
  if (workspace.kind !== 'folder' || !/^folder:.+/u.test(workspace.id)) {
    throw new Error(
      'Este candidato aceita somente workspaces de pasta. Worktrees Git aguardam uma ponte de identidade entre lista e hook do Orca.'
    )
  }
  const contextWindow = Number(input.contextWindow)
  if (!Number.isSafeInteger(contextWindow) || contextWindow < 4096 || contextWindow > 10_000_000) {
    throw new Error('Informe o limite real de contexto do modelo, entre 4096 e 10000000 tokens.')
  }
  return {
    workspaceId: workspace.id,
    workspacePath: absoluteFile(workspace.path, 'Workspace'),
    nodePath: absoluteFile(input.nodePath, 'Node'),
    biliEntry: absoluteFile(input.biliEntry, 'billion-context dist/index.js'),
    claudePath: absoluteFile(input.claudePath, 'Claude'),
    dataDirectory: absoluteFile(input.dataDirectory, 'Diretório de sessões'),
    upstream: upstreamUrl(input.upstream),
    contextWindow
  }
}

export function splitLiteralCommand(command) {
  const result = []
  let token = '',
    quote = null,
    started = false
  for (let i = 0; i < command.length; i++) {
    const char = command[i]
    if (char === '\0' || char === '\n' || char === '\r') {
      throw new Error('Comando multilinha não é suportado.')
    }
    if (quote === "'") {
      if (char === "'") {
        quote = null
      } else {
        token += char
      }
      continue
    }
    if (char === '\\') {
      if (i + 1 >= command.length) {
        throw new Error('Escape incompleto no comando.')
      }
      if (quote === '"' && !['$', '`', '"', '\\'].includes(command[i + 1])) {
        token += '\\'
      }
      token += command[++i]
      started = true
      continue
    }
    if (char === '$' || char === '`' || (!quote && /[;&|<>()*?[\]{}~#]/u.test(char))) {
      throw new Error(
        'O comando contém expansões ou operadores de shell; use um lançamento Claude simples.'
      )
    }
    if (quote === '"') {
      if (char === '"') {
        quote = null
      } else {
        token += char
      }
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (/\s/u.test(char)) {
      if (started) {
        result.push(token)
      }
      token = ''
      started = false
    } else {
      token += char
      started = true
    }
  }
  if (quote) {
    throw new Error('Aspas incompletas no comando.')
  }
  if (started) {
    result.push(token)
  }
  if (!result.length) {
    throw new Error('Comando vazio.')
  }
  return result
}

export function validateClaudeArguments(argv) {
  const excluded =
    /^(?:--(?:resume|continue|fork-session|session-id|settings|setting-sources|plugin-dir)|-r|-c)(?:=|$)/u
  if (argv.some((arg) => excluded.test(arg))) {
    throw new Error(
      'Retomadas e substituições de configuração exigem outro fluxo. Inicie uma sessão Claude nova.'
    )
  }
  return argv
}

export const shellQuote = (value) => `'${String(value).replace(/'/gu, `'"'"'`)}'`

export function decideLaunch(event, state, runnerPath) {
  if (state.enabled !== true) {
    return { kind: 'pass' }
  }
  if (state.plan?.workspaceId && event.workspaceId !== state.plan.workspaceId) {
    return { kind: 'pass' }
  }
  if (!state.ready || !state.plan || !state.planPath) {
    return {
      kind: 'deny',
      reason:
        'Contexto ligado sem preparação válida. Abra o painel Contexto e verifique a configuração.'
    }
  }
  if (event.agent !== 'claude') {
    return {
      kind: 'deny',
      reason:
        'Neste workspace, Contexto está ligado apenas para novos terminais Claude. Desligue o toggle para usar outro agente.'
    }
  }
  try {
    const [program, ...args] = splitLiteralCommand(event.command)
    if (program !== 'claude' && program !== state.plan.claudePath) {
      throw new Error('O comando não inicia diretamente o Claude verificado.')
    }
    validateClaudeArguments(args)
    return {
      kind: 'rewrite',
      command: [state.plan.nodePath, runnerPath, state.planPath, '--', ...args]
        .map(shellQuote)
        .join(' ')
    }
  } catch (error) {
    return { kind: 'deny', reason: error.message }
  }
}

export function proxyConfig(plan) {
  return {
    host: '127.0.0.1',
    upstream: plan.upstream,
    autoUpdate: false,
    autoRestartOnUpdate: false,
    advisoryCheck: false,
    releaseNotesCheck: false,
    autoModeForge: { enabled: false },
    mitm: { enabled: false },
    security: { adminRelay: false },
    log: false,
    logFile: 'off',
    debug: false,
    cacheKeepalive: { enabled: false },
    native: { attachExternal: false, attachPolicy: 'own-lane', attachLanePriority: [] },
    storage: {
      backend: 'sqlite',
      unified: 'full',
      jsonWriter: 'on',
      sqliteAutoDownload: false,
      archiveAfterDays: 0
    },
    persist: { enabled: true },
    diagnostics: { dumpBody: false, dumpReq: false, dump4xx: false },
    compress: {
      modelContextLimit: plan.contextWindow,
      maxContextLimit: '70%',
      emergencyThresholdPercent: '90%',
      externalSummary: { enabled: false }
    },
    rollout: { features: { pluginLaneServerHistory: false, pluginFullResendWatermark: false } }
  }
}

export function proxyEnvironment(runDirectory, base = process.env) {
  const env = {}
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot']) {
    if (base[key]) {
      env[key] = base[key]
    }
  }
  return {
    ...env,
    XDG_CONFIG_HOME: path.join(runDirectory, 'config'),
    XDG_DATA_HOME: path.join(runDirectory, 'data'),
    XDG_STATE_HOME: path.join(runDirectory, 'state'),
    XDG_CACHE_HOME: path.join(runDirectory, 'cache'),
    BILI_CONFIG_FILE: path.join(runDirectory, 'proxy.json'),
    BILI_SESSIONS_DIR: path.join(runDirectory, 'sessions'),
    ACP_AUTO_UPDATE: '0',
    ACP_AUTO_RESTART_ON_UPDATE: '0',
    BILI_AUTO_MODE_FORGE: '0',
    BILI_ADVISORY_CHECK: '0',
    BILI_RELEASE_NOTES_CHECK: '0',
    BILI_SQLITE_AUTO_DOWNLOAD: '0',
    BILI_CACHE_KEEPALIVE: '0',
    BILI_SESSION_GC: '0',
    BILI_MITM: '0',
    BILI_NATIVE_ATTACH_EXTERNAL: '0',
    BILI_STORAGE_BACKEND: 'sqlite',
    BILI_STRICT_PORT: '1',
    ACP_HOST: '127.0.0.1',
    ACP_DUMP_BODY: '0',
    ACP_DUMP_REQ: '0',
    BILI_DUMP_4XX: '0',
    ACP_LOG_FILE: 'off',
    ACP_LOG: '0'
  }
}

export const LEGACY_CONTEXT_CONTRACT = Object.freeze({
  projects: { input: {} },
  search: {
    input: {
      project: 'discovered project ID',
      query: 'string',
      budget: 'optional maximum context tokens'
    }
  },
  read: {
    input: {
      project: 'discovered project ID',
      path: 'relative project path',
      start: 'optional first line',
      end: 'optional last line; at most 400 lines'
    }
  },
  connectedByThisPlugin: false
})
