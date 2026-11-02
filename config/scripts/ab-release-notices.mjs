import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { x as extractTar } from 'tar'
import {
  NODE_RUNTIME_PIN,
  nodeRuntimeAsset,
  nodeRuntimeReleaseUrl
} from '../../src/shared/node-runtime-pin.ts'
import { fetchPinnedFile, pinnedNodeCacheDir } from './pinned-node-downloads.mjs'
import { stageDependencyNotices } from './ab-release-dependency-notices.mjs'

const root = resolve(import.meta.dirname, '../..')
export async function stageReleaseNotices(output, target) {
  const notices = join(output, 'notices')
  await mkdir(notices, { recursive: true })
  await cp(join(root, 'LICENSE'), join(notices, 'Orca-MIT.txt'))
  await stageDependencyNotices(notices)
  await cp(
    join(root, 'packages/ab-control/node_modules/@modelcontextprotocol/sdk/LICENSE'),
    join(notices, 'MCP-SDK-MIT.txt')
  )
  await cp(
    join(root, 'packages/ab-context-bridge/node_modules/gpt-tokenizer/LICENSE'),
    join(notices, 'gpt-tokenizer-MIT.txt')
  )
  const asset = nodeRuntimeAsset(target)
  /** @type {string} */
  const archive = await fetchPinnedFile({
    url: nodeRuntimeReleaseUrl(asset.source, asset.archive),
    destination: join(pinnedNodeCacheDir(), asset.archive),
    sha256: asset.archiveSha256
  })
  const temporary = await mkdtemp(join(tmpdir(), 'ab-node-notices-'))
  try {
    await extractTar({
      file: archive,
      cwd: temporary,
      filter: (path) => /^(?:[^/]+\/?|[^/]+\/LICENSE)$/.test(path)
    })
    const nodeDirectory = asset.archive.replace(/\.tar\.(?:gz|xz)$/, '')
    await cp(join(temporary, nodeDirectory, 'LICENSE'), join(notices, 'Node-LICENSE.txt'))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  await writeFile(
    join(notices, 'DISTRIBUTION.txt'),
    `AB-BRAINMASTER-ORCA distribution notices\n\nCore: Orca, MIT, Lovecast Inc.\nNode: ${NODE_RUNTIME_PIN.version}; complete bundled license in Node-LICENSE.txt.\nMCP SDK: 1.32.1; MIT.\ngpt-tokenizer: 4.0.0; MIT.\nFull dependency license texts and hashes are indexed in dependencies.json, based on actual esbuild output contributions and copied runtime artifacts.\nDebian package copyright files are installed under /usr/share/doc in Docker/ISO images.\nThe local inference backend and model are provisioned separately and require their own license notices.\n`
  )
}
