import {
  API_ROOT,
  BASE_SHA,
  REPOSITORY,
  LIMITS,
  ReviewError,
  parseRef,
  parseComparison,
  assessRisks
} from './github-contract.mjs'

const byteSize = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8')

function retryAt(headers, now) {
  const retry = headers.get('retry-after')
  const reset = Number(headers.get('x-ratelimit-reset')) * 1000
  const time = retry && /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry || '')
  const candidate = Number.isFinite(time) ? time : reset
  return Number.isFinite(candidate) && candidate > now && candidate < now + 7 * 86400000
    ? new Date(candidate).toISOString()
    : null
}

async function readJson(response, budget, signal) {
  const size = Number(response.headers.get('content-length'))
  if (size > LIMITS.responseBytes) {
    await response.body?.cancel()
    throw new ReviewError('size-limit', 'Resposta excede 4 MiB; revisão incompleta.')
  }
  if (!response.headers.get('content-type')?.includes('json')) {
    await response.body?.cancel()
    throw new ReviewError('invalid-response', 'GitHub não retornou JSON.')
  }
  if (!response.body) {
    throw new ReviewError('invalid-response', 'Resposta sem corpo.')
  }
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      bytes += value.byteLength
      budget.bytes += value.byteLength
      if (bytes > LIMITS.responseBytes || budget.bytes > LIMITS.totalBytes) {
        throw new ReviewError('size-limit', 'Limite de dados atingido; revisão incompleta.')
      }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    await reader.cancel().catch(() => {})
    if (error instanceof SyntaxError) {
      throw new ReviewError('invalid-response', 'JSON inválido na resposta do GitHub.')
    }
    throw error
  } finally {
    reader.releaseLock()
  }
}

export function createReviewer({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map()
  let active = false
  let blockedUntil = 0

  function remember(url, etag, value) {
    if (!etag || etag.length > 256 || !/^(W\/)?"[\x21\x23-\x7e]*"$/.test(etag)) {
      return
    }
    const entry = { etag, value: structuredClone(value), at: now(), bytes: byteSize(value) }
    cache.delete(url)
    if (entry.bytes > LIMITS.cacheBytes) {
      return
    }
    cache.set(url, entry)
    while (
      cache.size > LIMITS.cacheEntries ||
      [...cache.values()].reduce((sum, item) => sum + item.bytes, 0) > LIMITS.cacheBytes
    ) {
      cache.delete(cache.keys().next().value)
    }
  }

  async function get(endpoint, parser, budget, overallSignal) {
    const url = `${API_ROOT}/${endpoint}`
    const cached = cache.get(url)
    const validCache =
      cached && now() - cached.at >= 0 && now() - cached.at < LIMITS.cacheMs ? cached : null
    if (!validCache) {
      cache.delete(url)
    }
    const signal = AbortSignal.any([overallSignal, AbortSignal.timeout(LIMITS.requestMs)])
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AB-BRAINMASTER-upstream-review/0.1'
    }
    if (validCache) {
      headers['If-None-Match'] = validCache.etag
    }
    budget.requests++
    const response = await fetchImpl(url, {
      method: 'GET',
      headers,
      redirect: 'error',
      credentials: 'omit',
      signal
    })
    if (response.status === 304) {
      if (!validCache) {
        throw new ReviewError('invalid-response', 'GitHub retornou 304 sem cache válido.')
      }
      budget.revalidated++
      return structuredClone(validCache.value)
    }
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get('x-ratelimit-remaining') === '0' ||
          response.headers.has('retry-after')))
    ) {
      const retryAfter = retryAt(response.headers, now())
      blockedUntil = retryAfter ? Date.parse(retryAfter) : now() + 60000
      await response.body?.cancel()
      throw new ReviewError(
        'rate-limited',
        'Limite da API GitHub atingido. Tente novamente após o horário indicado.',
        { retryAfter: new Date(blockedUntil).toISOString() }
      )
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new ReviewError(
        response.status === 403 ? 'access-denied' : 'http-error',
        `GitHub respondeu HTTP ${response.status}.`,
        { httpStatus: response.status }
      )
    }
    const raw = await readJson(response, budget, signal)
    const value = parser(raw)
    remember(url, response.headers.get('etag'), value)
    return value
  }

  return async function review({ confirmed = false, signal } = {}) {
    if (confirmed !== true) {
      throw new ReviewError('explicit-action-required', 'A consulta exige ação explícita.')
    }
    if (active) {
      throw new ReviewError('busy', 'Já existe uma revisão em andamento.')
    }
    active = true
    const started = now()
    const budget = { requests: 0, bytes: 0, revalidated: 0 }
    const report = {
      format: 1,
      repository: REPOSITORY,
      baseSha: BASE_SHA,
      targetRef: 'main',
      targetSha: null,
      checkedAt: new Date(started).toISOString(),
      status: 'partial',
      scope: 'metadata-only',
      commitsComplete: false,
      filesComplete: false,
      comparison: null,
      commits: [],
      files: [],
      risks: [],
      limitations: [
        'Triagem por metadados e caminhos; não avalia patches, compatibilidade funcional, conflitos reais nem segurança do código.'
      ],
      warnings: [],
      budget,
      error: null
    }
    try {
      if (blockedUntil > now()) {
        throw new ReviewError('rate-limited', 'Aguarde o fim do limite da API GitHub.', {
          retryAfter: new Date(blockedUntil).toISOString()
        })
      }
      const overallSignal = AbortSignal.any([
        AbortSignal.timeout(LIMITS.reviewMs),
        ...(signal ? [signal] : [])
      ])
      overallSignal.throwIfAborted()
      report.targetSha = (await get('git/ref/heads/main', parseRef, budget, overallSignal)).sha
      report.compareUrl = `https://github.com/${REPOSITORY}/compare/${BASE_SHA}...${report.targetSha}`
      const seen = new Set()
      let expected = null
      for (let page = 1; page <= LIMITS.pages; page++) {
        const parsed = await get(
          `compare/${BASE_SHA}...${report.targetSha}?per_page=${LIMITS.perPage}&page=${page}`,
          (value) => parseComparison(value, page),
          budget,
          overallSignal
        )
        const metadata = {
          status: parsed.status,
          totalCommits: parsed.totalCommits,
          aheadBy: parsed.aheadBy,
          behindBy: parsed.behindBy,
          mergeBaseSha: parsed.mergeBaseSha
        }
        if (page === 1) {
          expected = JSON.stringify(metadata)
          report.comparison = metadata
          report.files = parsed.files
          report.filesComplete = parsed.files.length < LIMITS.files
          if (!report.filesComplete) {
            report.warnings.push(
              'A comparação atingiu 300 arquivos; a API pode ter omitido arquivos. A lista não é comprovadamente completa.'
            )
          }
        } else if (expected !== JSON.stringify(metadata)) {
          throw new ReviewError(
            'invalid-response',
            'Metadados divergentes entre páginas da mesma comparação fixada.'
          )
        }
        for (const commit of parsed.commits) {
          if (seen.has(commit.sha)) {
            throw new ReviewError(
              'invalid-response',
              'Commit duplicado entre páginas; enumeração não confiável.'
            )
          }
          seen.add(commit.sha)
          report.commits.push(commit)
        }
        if (report.commits.length > parsed.totalCommits) {
          throw new ReviewError(
            'invalid-response',
            'Quantidade de commits excede o total declarado.'
          )
        }
        if (report.commits.length === parsed.totalCommits) {
          report.commitsComplete = true
          break
        }
        if (parsed.commits.length < LIMITS.perPage) {
          throw new ReviewError('invalid-response', 'Página incompleta antes do total declarado.')
        }
      }
      if (
        report.comparison.totalCommits !== report.comparison.aheadBy ||
        (report.comparison.status === 'identical' &&
          (report.targetSha !== BASE_SHA ||
            report.comparison.totalCommits !== 0 ||
            report.files.length !== 0)) ||
        (report.commitsComplete &&
          report.commits.length > 0 &&
          report.commits.at(-1).sha !== report.targetSha)
      ) {
        throw new ReviewError(
          'invalid-response',
          'A comparação não confirma o alvo e as contagens declarados.'
        )
      }
      if (!report.commitsComplete) {
        report.warnings.push(
          'Limite de cinco páginas/500 commits atingido; commits restantes não foram revisados.'
        )
      }
      if (
        report.comparison.status === 'behind' ||
        report.comparison.status === 'diverged' ||
        report.comparison.mergeBaseSha !== BASE_SHA
      ) {
        report.warnings.push(
          'Histórico não linear em relação à base AB; exige análise manual de ancestralidade.'
        )
      }
      report.status =
        report.commitsComplete && report.filesComplete && report.warnings.length === 0
          ? 'complete'
          : 'partial'
    } catch (error) {
      const known = error instanceof ReviewError
      const code = known
        ? error.code
        : signal?.aborted
          ? 'cancelled'
          : error?.name === 'TimeoutError' || error?.name === 'AbortError'
            ? 'timeout'
            : 'offline'
      report.status = code
      report.error = {
        code,
        message: known
          ? error.message
          : code === 'offline'
            ? 'Não foi possível acessar o GitHub. Verifique a conexão e tente novamente.'
            : code === 'cancelled'
              ? 'Consulta cancelada.'
              : 'Tempo limite da consulta atingido.',
        ...(known ? error.details : {})
      }
      report.commitsComplete = false
      report.filesComplete = false
    } finally {
      active = false
      report.risks = assessRisks(report.files)
      report.durationMs = Math.max(0, now() - started)
    }
    if (byteSize(report) > LIMITS.reportBytes) {
      report.status = 'size-limit'
      report.commitsComplete = false
      report.filesComplete = false
      report.commits = []
      report.files = []
      report.risks = []
      report.warnings.push(
        'Relatório excedeu 900 KiB. Listas removidas explicitamente; solicite revisão externa da comparação.'
      )
    }
    return report
  }
}
