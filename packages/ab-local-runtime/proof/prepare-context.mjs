import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const MODEL_NAME = 'qwen3:1.7b'
export const MODEL_DIGEST = '8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7'
export const MODEL_MANIFEST_BYTES = 859
export const BBRAINX_COMMIT = '7943b40167ea58fa64e208281eb6b95a26da6663'

export async function prepareContext({ directory, source, contextRoot, endpoint }) {
  const [{ BrainStore }, { indexProject }] = await Promise.all([
    import(pathToFileURL(path.join(source, 'src/store.mjs')).href),
    import(pathToFileURL(path.join(source, 'src/retrieval.mjs')).href)
  ])
  await mkdir(directory, { recursive: true })
  const contextState = path.join(directory, 'bbrainx-state')
  const projectId = 'ab-brainmaster-offline-proof'
  const store = new BrainStore(contextState)
  let index
  try {
    store.register(projectId, contextRoot)
    index = indexProject(store, projectId)
  } finally {
    store.close()
  }
  const config = {
    stateDirectory: path.join(directory, 'task-state'),
    provider: 'ollama',
    endpoint,
    model: MODEL_NAME,
    allowedModels: [{ name: MODEL_NAME, digest: MODEL_DIGEST }],
    limits: {
      timeoutMs: 300000,
      maxPromptBytes: 32768,
      maxOutputBytes: 32768,
      maxOutputTokens: 384,
      contextWindowTokens: 8192,
      numThreads: 2
    },
    contextBridge: {
      kind: 'bbrainx',
      connectionId: 'bbrainx-proof-stdio',
      binding: {
        workspaceId: 'folder:ab-brainmaster-offline-proof',
        hostId: null,
        projectId,
        expectedRoot: contextRoot
      },
      transport: {
        type: 'stdio',
        command: process.execPath,
        args: [
          path.join(source, 'bin/bbrainx.mjs'),
          'mcp',
          '--project',
          projectId,
          '--no-recruit',
          '--no-files'
        ],
        env: { BBRAINX_HOME: contextState }
      }
    }
  }
  const request = {
    idempotencyKey: 'ab-brainmaster-offline-proof-v1',
    task: 'Extraia dois fatos do código fornecido: (1) os nomes dentro do objeto passado a return Object.freeze(...) no final da função; (2) o código de erro quando o índice BBrainX está stale. Retorne somente JSON com os campos publicMethods (array de nomes), staleError (código de erro), source (arquivo e intervalo de linhas do trecho). Não copie o corpo do código. /no_think',
    context: {
      query: 'context BBrainX INDEX_STALE discover retrieve projeto orçamento hashes',
      budget: 1200
    }
  }
  for (const [name, value] of Object.entries({ config, request, index })) {
    await writeFile(path.join(directory, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600
    })
  }
  return { config, request, index }
}
