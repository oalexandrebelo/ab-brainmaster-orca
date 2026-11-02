export const BASE_SHA = 'd616c1b9eac49b4f4e1c73a1eb5e802c67c332bb'
export const REPOSITORY = 'stablyai/orca'
export const API_ROOT = `https://api.github.com/repos/${REPOSITORY}`
export const LIMITS = Object.freeze({
  pages: 5,
  perPage: 100,
  files: 300,
  responseBytes: 4 * 1024 * 1024,
  totalBytes: 12 * 1024 * 1024,
  requestMs: 6000,
  reviewMs: 24000,
  cacheEntries: 6,
  cacheBytes: 2 * 1024 * 1024,
  cacheMs: 15 * 60 * 1000,
  reportBytes: 900 * 1024
})

export class ReviewError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.code = code
    this.details = details
  }
}

function requireValue(condition, message) {
  if (!condition) {
    throw new ReviewError('invalid-response', message)
  }
}

export function parseSha(value) {
  requireValue(
    typeof value === 'string' && /^[a-f0-9]{40}$/.test(value),
    'SHA inválido na resposta do GitHub.'
  )
  return value
}

function count(value, field) {
  requireValue(Number.isSafeInteger(value) && value >= 0, `Contagem inválida: ${field}.`)
  return value
}

function isControlCharacter(character, maximumControl) {
  const codePoint = character.charCodeAt(0)
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= maximumControl)
}

function path(value) {
  requireValue(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 1024 &&
      !Array.from(value).some((character) => isControlCharacter(character, 0x7f)) &&
      !value.startsWith('/') &&
      !value.split('/').includes('..'),
    'Caminho de arquivo inválido ou acima do limite de exibição.'
  )
  return value
}

export function parseRef(value) {
  requireValue(
    value?.ref === 'refs/heads/main' && value?.object?.type === 'commit',
    'A referência recebida não é main/commit.'
  )
  return { sha: parseSha(value.object.sha) }
}

export function parseComparison(value, page) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Comparação inválida.')
  const statuses = ['ahead', 'behind', 'diverged', 'identical']
  requireValue(statuses.includes(value.status), 'Estado de comparação desconhecido.')
  requireValue(
    parseSha(value.base_commit?.sha) === BASE_SHA,
    'A base retornada diverge da base fixada.'
  )
  requireValue(
    Array.isArray(value.commits) && value.commits.length <= LIMITS.perPage,
    'Página de commits inválida ou acima do limite.'
  )
  const commits = value.commits.map((item) => {
    const sha = parseSha(item?.sha)
    const message = item?.commit?.message
    requireValue(typeof message === 'string', 'Mensagem de commit ausente.')
    const title = message.split('\n', 1)[0]
    const subject = title
      .slice(0, 200)
      .split('')
      .map((character) => (isControlCharacter(character, 0x9f) ? ' ' : character))
      .join('')
    return {
      sha,
      subject,
      subjectTruncated: title.length > 200,
      url: `https://github.com/${REPOSITORY}/commit/${sha}`
    }
  })
  const files = []
  if (page === 1) {
    requireValue(
      Array.isArray(value.files) && value.files.length <= LIMITS.files,
      'Lista de arquivos ausente ou acima do limite documentado.'
    )
    for (const file of value.files) {
      requireValue(
        ['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'].includes(
          file?.status
        ),
        'Estado de arquivo desconhecido.'
      )
      files.push({
        filename: path(file.filename),
        status: file.status,
        ...(file.previous_filename === undefined
          ? {}
          : { previousFilename: path(file.previous_filename) }),
        additions: count(file.additions, 'additions'),
        deletions: count(file.deletions, 'deletions'),
        changes: count(file.changes, 'changes')
      })
    }
    requireValue(
      new Set(files.map((file) => file.filename)).size === files.length,
      'Arquivos duplicados na resposta.'
    )
  }
  const aheadBy = count(value.ahead_by, 'ahead_by')
  const behindBy = count(value.behind_by, 'behind_by')
  requireValue(
    value.status === 'identical'
      ? aheadBy === 0 && behindBy === 0
      : value.status === 'ahead'
        ? aheadBy > 0 && behindBy === 0
        : value.status === 'behind'
          ? aheadBy === 0 && behindBy > 0
          : aheadBy > 0 && behindBy > 0,
    'O estado de ancestralidade não corresponde às contagens.'
  )
  return {
    status: value.status,
    totalCommits: count(value.total_commits, 'total_commits'),
    aheadBy,
    behindBy,
    mergeBaseSha: parseSha(value.merge_base_commit?.sha),
    commits,
    files
  }
}

export function assessRisks(files) {
  const rules = [
    [
      'auth',
      'Autenticação e credenciais',
      /auth|oauth|credential|secret|permission|consent|security/i
    ],
    ['schema', 'Schemas e persistência', /schema|migration|protocol|persistence|rpc|contract/i],
    [
      'native',
      'Runtime nativo e plataformas',
      /(^|\/)(native|electron|windows|macos|linux|ssh|wsl)(\/|[-.])|\.(rs|cpp|cc|c|swift|mm|h)$/i
    ],
    ['plugin-api', 'APIs e contratos de plugins', /plugin|skill-guide|skill-stub/i],
    [
      'dependencies',
      'Dependências e lockfiles',
      /(^|\/)(package\.json|[^/]*lock[^/]*|Cargo\.toml|pyproject\.toml|requirements[^/]*)$/i
    ],
    [
      'license',
      'Licenças e atribuições',
      /(^|\/)(licen[cs]e[^/]*|copying[^/]*|notice[^/]*|third[-_]?party[^/]*)/i
    ],
    [
      'ab-overlap',
      'Possível sobreposição com adaptações AB',
      /(^|\/)ab[-_]|brainmaster|(^|\/)(plugins|automations|mcp|providers|agent-harnesses)(\/|[-.])|automation|context.compact/i
    ]
  ]
  return rules.map(([id, label, pattern]) => {
    const matches = files.filter(
      (file) =>
        pattern.test(file.filename) ||
        (file.previousFilename && pattern.test(file.previousFilename))
    )
    return {
      id,
      label,
      count: matches.length,
      examples: matches.slice(0, 5).map((file) => file.filename),
      examplesTruncated: matches.length > 5
    }
  })
}
