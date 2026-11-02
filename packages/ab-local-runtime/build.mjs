import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

await mkdir(path.join(import.meta.dirname, 'dist'), { recursive: true })
const result = await build({
  absWorkingDir: path.resolve(import.meta.dirname, '../..'),
  entryPoints: ['runtime.mjs', 'cli.mjs'].map((file) => path.join(import.meta.dirname, file)),
  outdir: path.join(import.meta.dirname, 'dist'),
  outExtension: { '.js': '.mjs' },
  bundle: true,
  metafile: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  banner: {
    js: 'import { createRequire as abCreateRequire } from "node:module"; const require = abCreateRequire(import.meta.url);'
  },
  logLevel: 'info'
})
await writeFile(
  path.join(import.meta.dirname, 'dist/metafile.json'),
  `${JSON.stringify(result.metafile, null, 2)}\n`
)
