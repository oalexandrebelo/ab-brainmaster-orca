import http from 'node:http'
import https from 'node:https'
import { LocalRuntimeError, requireValue, sha256 } from './policy.mjs'

function requestJson(endpoint, route, { body, signal, maxBytes }) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, endpoint)
    const data = body === undefined ? undefined : JSON.stringify(body)
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.request(
      url,
      {
        method: data === undefined ? 'GET' : 'POST',
        signal,
        headers:
          data === undefined
            ? {}
            : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.destroy()
          reject(
            new LocalRuntimeError(
              'PROVIDER_REJECTED',
              `The local provider returned HTTP ${response.statusCode}; redirects and automatic pulls are disabled.`
            )
          )
          return
        }
        let size = 0
        const chunks = []
        response.on('data', (chunk) => {
          size += chunk.length
          if (size > maxBytes) {
            response.destroy(
              new LocalRuntimeError(
                'OUTPUT_LIMIT',
                'The provider response exceeds the configured byte limit.'
              )
            )
            return
          }
          chunks.push(chunk)
        })
        response.on('error', reject)
        response.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch {
            reject(
              new LocalRuntimeError(
                'PROVIDER_PROTOCOL',
                'The local provider returned invalid JSON.'
              )
            )
          }
        })
      }
    )
    request.on('error', (error) =>
      reject(
        error instanceof LocalRuntimeError || signal?.aborted
          ? error
          : new LocalRuntimeError(
              'PROVIDER_UNAVAILABLE',
              'The configured loopback provider could not be reached.'
            )
      )
    )
    request.end(data)
  })
}

export async function inspectModel(config, signal) {
  const options = { signal, maxBytes: 262144 }
  const tags = await requestJson(config.endpoint, '/api/tags', options)
  requireValue(
    Array.isArray(tags.models),
    'PROVIDER_PROTOCOL',
    'The provider returned no installed model catalog.'
  )
  const installed = tags.models.find(
    (item) => item.name === config.model || item.model === config.model
  )
  requireValue(
    installed,
    'MODEL_UNAVAILABLE',
    'The configured model is not installed; install it explicitly before running tasks.'
  )
  const expected = config.allowedModels.find((item) => item.name === config.model)
  requireValue(
    installed.digest === expected.digest,
    'MODEL_DIGEST_MISMATCH',
    'The installed model digest differs from the allowlist.'
  )
  const metadata = await requestJson(config.endpoint, '/api/show', {
    ...options,
    body: { model: config.model }
  })
  requireValue(
    typeof metadata.template === 'string' &&
      sha256(metadata.template) === config.modelProfile.templateSha256 &&
      !metadata.system &&
      metadata.model_info?.['tokenizer.ggml.model'] === config.modelProfile.tokenizerModel &&
      metadata.model_info?.['tokenizer.ggml.pre'] === config.modelProfile.tokenizerPre &&
      metadata.model_info?.['tokenizer.ggml.add_bos_token'] === false,
    'MODEL_PROFILE_MISMATCH',
    'The provider tokenizer or template differs from the audited byte-budget profile.'
  )
  const version = await requestJson(config.endpoint, '/api/version', options)
  requireValue(
    typeof version.version === 'string' && version.version.length <= 128,
    'PROVIDER_PROTOCOL',
    'The provider returned no bounded version identifier.'
  )
  return {
    name: config.model,
    digest: installed.digest,
    provider: 'ollama',
    providerVersion: version.version,
    endpoint: config.endpoint,
    budgetProfile: config.modelProfile
  }
}

export async function infer(config, messages, signal) {
  const options = {
    temperature: 0,
    seed: 42,
    num_gpu: 0,
    num_thread: config.limits.numThreads,
    num_ctx: config.limits.contextWindowTokens,
    num_predict: config.limits.maxOutputTokens
  }
  const response = await requestJson(config.endpoint, '/api/chat', {
    signal,
    maxBytes: config.limits.maxOutputBytes + 32768,
    body: { model: config.model, messages, stream: false, think: false, keep_alive: 0, options }
  })
  requireValue(
    response.done === true &&
      response.model === config.model &&
      typeof response.message?.content === 'string' &&
      response.message.content.trim().length > 0,
    'PROVIDER_PROTOCOL',
    'The provider did not return a completed response for the requested model.'
  )
  const text = response.message.content
  requireValue(
    Buffer.byteLength(text) <= config.limits.maxOutputBytes,
    'OUTPUT_LIMIT',
    'Model output exceeds the configured byte limit.'
  )
  const metrics = {}
  for (const key of [
    'total_duration',
    'load_duration',
    'prompt_eval_count',
    'prompt_eval_duration',
    'eval_count',
    'eval_duration'
  ]) {
    metrics[key] = Number.isSafeInteger(response[key]) && response[key] >= 0 ? response[key] : null
  }
  requireValue(
    metrics.prompt_eval_count !== null &&
      metrics.prompt_eval_count > 0 &&
      metrics.prompt_eval_count + config.limits.maxOutputTokens <=
        config.limits.contextWindowTokens,
    'PROVIDER_TOKEN_BUDGET',
    'The provider did not confirm an input token count within the reserved context window.'
  )
  return {
    result: {
      text,
      sha256: sha256(text),
      bytes: Buffer.byteLength(text),
      truncated: response.done_reason === 'length',
      executable: false
    },
    provider: {
      done: true,
      doneReason: response.done_reason ?? null,
      options,
      metrics,
      thinkingRequested: false
    }
  }
}
