import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createReviewer } from '../review.mjs'
import { BASE_SHA, LIMITS, parseComparison, parseRef, assessRisks } from '../github-contract.mjs'
import activate from '../worker.mjs'

const head = 'a'.repeat(40)
const commit = (sha = head, message = 'Change') => ({ sha, commit: { message } })
const file = (filename = 'src/main/plugins/auth-schema.ts') => ({
  filename,
  status: 'modified',
  additions: 2,
  deletions: 1,
  changes: 3
})
const ref = (sha = head) => ({ ref: 'refs/heads/main', object: { type: 'commit', sha } })
const comparison = (extra = {}) => ({
  status: 'ahead',
  base_commit: { sha: BASE_SHA },
  merge_base_commit: { sha: BASE_SHA },
  total_commits: 1,
  ahead_by: 1,
  behind_by: 0,
  commits: [commit()],
  files: [file()],
  ...extra
})
const response = (body, options = {}) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...options.headers },
    status: options.status || 200
  })
const fixtureFetch =
  (compare = comparison(), requests = []) =>
  async (url, options) => {
    requests.push({ url, options })
    return response(url.includes('/git/ref/') ? ref() : compare)
  }

test('explicit action is required; activation itself performs no GET', async () => {
  let calls = 0
  const review = createReviewer({
    fetchImpl: async () => {
      calls++
      throw new Error('unexpected')
    }
  })
  await assert.rejects(review(), { code: 'explicit-action-required' })
  assert.equal(calls, 0)
  const handlers = new Map()
  activate({ panels: { handle: (name, handler) => handlers.set(name, handler) } })
  assert.equal(handlers.size, 1)
  await assert.rejects(
    handlers.get('upstream.review')({ confirmed: true, url: 'https://evil.test' }, {}),
    { code: 'invalid-input' }
  )
})

test('resolves main, pins both SHAs, and sends only unauthenticated GET without redirects', async () => {
  const requests = []
  const report = await createReviewer({ fetchImpl: fixtureFetch(comparison(), requests) })({
    confirmed: true
  })
  assert.equal(report.status, 'complete')
  assert.equal(report.scope, 'metadata-only')
  assert.equal(report.targetSha, head)
  assert.equal(report.baseSha, BASE_SHA)
  assert.equal(requests.length, 2)
  assert.equal(
    requests[1].url,
    `https://api.github.com/repos/stablyai/orca/compare/${BASE_SHA}...${head}?per_page=100&page=1`
  )
  for (const request of requests) {
    assert.equal(request.options.method, 'GET')
    assert.equal(request.options.redirect, 'error')
    assert.equal(request.options.credentials, 'omit')
    assert.equal(request.options.headers.Authorization, undefined)
  }
  assert.ok(report.risks.find((risk) => risk.id === 'auth').count)
})

test('300 files is explicitly incomplete even if commits are complete', async () => {
  const report = await createReviewer({
    fetchImpl: fixtureFetch(
      comparison({ files: Array.from({ length: 300 }, (_, i) => file(`src/${i}.ts`)) })
    )
  })({ confirmed: true })
  assert.equal(report.status, 'partial')
  assert.equal(report.commitsComplete, true)
  assert.equal(report.filesComplete, false)
  assert.match(report.warnings[0], /300/)
})

test('paginates a fixed SHA and refuses duplicate commits or changing counts', async () => {
  const first = Array.from({ length: 100 }, (_, i) =>
    commit((i + 1).toString(16).padStart(40, '0'))
  )
  for (const variant of ['good', 'duplicate', 'inconsistent']) {
    const fetchImpl = async (url) =>
      response(
        url.includes('/git/ref/')
          ? ref()
          : comparison({
              total_commits: variant === 'inconsistent' && url.endsWith('page=2') ? 102 : 101,
              ahead_by: 101,
              commits: url.endsWith('page=1')
                ? first
                : [variant === 'duplicate' ? first[0] : commit()]
            })
      )
    const report = await createReviewer({ fetchImpl })({ confirmed: true })
    assert.equal(report.status, variant === 'good' ? 'complete' : 'invalid-response')
  }
})

test('maximum page count never becomes a complete review', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/git/ref/')) {
      return response(ref())
    }
    const page = Number(new URL(url).searchParams.get('page'))
    return response(
      comparison({
        total_commits: 501,
        ahead_by: 501,
        commits: Array.from({ length: 100 }, (_, i) =>
          commit((page * 100 + i).toString(16).padStart(40, '0'))
        )
      })
    )
  }
  const report = await createReviewer({ fetchImpl })({ confirmed: true })
  assert.equal(report.status, 'partial')
  assert.equal(report.commits.length, 500)
  assert.equal(report.budget.requests, 6)
})

test('ETag cache needs revalidation and offline never replays a successful review', async () => {
  let mode = 'fresh'
  const fetchImpl = async (url, options) => {
    if (mode === 'offline') {
      throw new TypeError('private network detail')
    }
    if (mode === 'cached') {
      assert.equal(options.headers['If-None-Match'], '"revision"')
      return new Response(null, { status: 304 })
    }
    return response(url.includes('/git/ref/') ? ref() : comparison(), {
      headers: { etag: '"revision"' }
    })
  }
  const review = createReviewer({ fetchImpl })
  assert.equal((await review({ confirmed: true })).status, 'complete')
  mode = 'cached'
  const cached = await review({ confirmed: true })
  assert.equal(cached.budget.revalidated, 2)
  assert.equal(cached.status, 'complete')
  mode = 'offline'
  const offline = await review({ confirmed: true })
  assert.equal(offline.status, 'offline')
  assert.equal(offline.commits.length, 0)
  assert.equal(offline.filesComplete, false)
  assert.doesNotMatch(offline.error.message, /private/)
})

test('expired cache and unexpected 304 are not trusted', async () => {
  let time = 1000000000000
  let second = false
  const review = createReviewer({
    now: () => time,
    fetchImpl: async (url, options) => {
      if (second) {
        assert.equal(options.headers['If-None-Match'], undefined)
        return new Response(null, { status: 304 })
      }
      return response(url.includes('/git/ref/') ? ref() : comparison(), {
        headers: { etag: '"revision"' }
      })
    }
  })
  await review({ confirmed: true })
  time += LIMITS.cacheMs + 1
  second = true
  assert.equal((await review({ confirmed: true })).status, 'invalid-response')
})

test('rate limits create cooldown without automatic retry', async () => {
  let calls = 0
  const review = createReviewer({
    fetchImpl: async () => {
      calls++
      return response({}, { status: 429, headers: { 'retry-after': '60' } })
    }
  })
  const first = await review({ confirmed: true })
  assert.equal(first.status, 'rate-limited')
  assert.ok(first.error.retryAfter)
  assert.equal((await review({ confirmed: true })).status, 'rate-limited')
  assert.equal(calls, 1)
})

test('malformed payload, foreign ref, oversized response, redirects, cancellation and timeout fail closed', async () => {
  assert.throws(() => parseRef({ ...ref(), ref: 'refs/heads/evil' }), { code: 'invalid-response' })
  assert.throws(() => parseComparison(comparison({ files: [file('../../secret')] }), 1), {
    code: 'invalid-response'
  })
  assert.throws(() => parseComparison(comparison({ total_commits: -1 }), 1), {
    code: 'invalid-response'
  })
  for (const codePoint of [0, 9, 31, 127]) {
    const control = String.fromCharCode(codePoint)
    assert.throws(
      () => parseComparison(comparison({ files: [file(`src/${control}name.ts`)] }), 1),
      { code: 'invalid-response' }
    )
  }
  const controlTitle = `Primeiro${String.fromCharCode(9, 31, 127, 159)}último`
  assert.equal(
    parseComparison(comparison({ commits: [commit(head, controlTitle)] }), 1).commits[0].subject,
    'Primeiro    último'
  )
  const cases = [
    [
      'invalid-response',
      async () => new Response('{bad', { headers: { 'content-type': 'application/json' } })
    ],
    [
      'size-limit',
      async () =>
        new Response('x'.repeat(LIMITS.responseBytes + 1), {
          headers: { 'content-type': 'application/json' }
        })
    ],
    [
      'size-limit',
      async () =>
        new Response('{}', {
          headers: {
            'content-type': 'application/json',
            'content-length': String(LIMITS.responseBytes + 1)
          }
        })
    ],
    [
      'http-error',
      async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/' } })
    ],
    [
      'timeout',
      async () => {
        throw new DOMException('timed out', 'TimeoutError')
      }
    ]
  ]
  for (const [status, fetchImpl] of cases) {
    assert.equal((await createReviewer({ fetchImpl })({ confirmed: true })).status, status)
  }
  const controller = new AbortController()
  controller.abort()
  const cancelled = await createReviewer({ fetchImpl: fixtureFetch() })({
    confirmed: true,
    signal: controller.signal
  })
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.budget.requests, 0)
})

test('missing pages and incorrect target never report completeness; partial files remain clearly partial', async () => {
  const cases = [
    comparison({ total_commits: 2, ahead_by: 2 }),
    comparison({ commits: [commit('b'.repeat(40))] }),
    comparison({ files: undefined })
  ]
  for (const value of cases) {
    const report = await createReviewer({ fetchImpl: fixtureFetch(value) })({ confirmed: true })
    assert.equal(report.status, 'invalid-response')
    assert.equal(report.filesComplete, false)
  }
})

test('risk matching checks old names for renamed sensitive files', () => {
  const risks = assessRisks([{ filename: 'docs/readme.md', previousFilename: 'src/auth/token.ts' }])
  assert.equal(risks.find((risk) => risk.id === 'auth').count, 1)
})

test('panel uses real bridge input/output, no request on load, and untrusted content only as text', async () => {
  const source = await readFile(new URL('../panel.js', import.meta.url), 'utf8')
  class Element {
    children = []
    listeners = {}
    textContent = ''
    disabled = false
    appendChild(child) {
      this.children.push(child)
    }
    replaceChildren() {
      this.children = []
    }
    addEventListener(event, listener) {
      this.listeners[event] = listener
    }
    set innerHTML(_) {
      throw new Error('unsafe HTML')
    }
  }
  const elements = new Map(
    ['review', 'cancel', 'status', 'result'].map((id) => [id, new Element()])
  )
  let calls = 0
  const attack = '<img src=x onerror=alert(1)>'
  const report = await createReviewer({
    fetchImpl: fixtureFetch(
      comparison({ commits: [commit(head, attack)], files: [file(`src/${attack}.ts`)] })
    )
  })({ confirmed: true })
  const context = {
    document: { getElementById: (id) => elements.get(id), createElement: () => new Element() },
    AbortController,
    setTimeout,
    clearTimeout,
    orca: {
      host: {
        call: async (method, params) => {
          calls++
          assert.equal(method, 'plugin.request')
          assert.equal(params.input.confirmed, true)
          assert.equal(params.data, undefined)
          return { output: report }
        }
      }
    }
  }
  vm.runInNewContext(source, context)
  assert.equal(calls, 0)
  await elements.get('review').listeners.click()
  assert.equal(calls, 1)
  const texts = (element) => [element.textContent, ...element.children.flatMap(texts)]
  assert.ok(texts(elements.get('result')).some((text) => text.includes(attack)))
  assert.equal(elements.get('review').disabled, false)
})
