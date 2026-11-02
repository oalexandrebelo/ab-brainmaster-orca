import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { writeReleaseBuildMetadata } from '../../config/scripts/ab-release-build-metadata.mjs'

const root = resolve(import.meta.dirname, '../..')
mkdirSync(join(import.meta.dirname, 'dist'), { recursive: true })
const result = await build({
  absWorkingDir: root,
  entryPoints: ['server.mjs', 'cli.mjs', 'mcp.mjs', 'host.mjs', 'runtime-adapter.ts'].map((file) =>
    join(import.meta.dirname, file)
  ),
  outdir: join(import.meta.dirname, 'dist'),
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  metafile: true,
  banner: {
    js: 'import { createRequire as abCreateRequire } from "node:module"; import { fileURLToPath as abFilePath } from "node:url"; import { dirname as abDirname } from "node:path"; const require = abCreateRequire(import.meta.url); const __filename = abFilePath(import.meta.url); const __dirname = abDirname(__filename);'
  },
  logLevel: 'info'
})
await writeReleaseBuildMetadata(
  'control',
  [result.metafile],
  Object.keys(result.metafile.outputs).map((path) => resolve(root, path))
)
