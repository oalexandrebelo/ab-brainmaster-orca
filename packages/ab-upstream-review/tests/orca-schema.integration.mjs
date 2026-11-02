import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

const source = process.env.AB_ORCA_TEST_SOURCE
const zod = process.env.AB_ORCA_TEST_ZOD

test(
  'manifest validates with the actual Orca schema and preserves the host version gate',
  { skip: !source || !zod },
  async () => {
    const hooks = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === 'zod') {
          return nextResolve(pathToFileURL(zod).href, context)
        }
        try {
          return nextResolve(specifier, context)
        } catch (error) {
          if (
            (specifier.startsWith('./') || specifier.startsWith('../')) &&
            !path.extname(specifier)
          ) {
            return nextResolve(`${specifier}.ts`, context)
          }
          throw error
        }
      }
    })
    try {
      const moduleUrl = pathToFileURL(
        path.join(source, 'src/shared/plugins/manifest/plugin-manifest.ts')
      ).href
      const { parsePluginManifest, satisfiesOrcaEngineRange } = await import(moduleUrl)
      const raw = JSON.parse(
        await fs.readFile(new URL('../orca-plugin.json', import.meta.url), 'utf8')
      )
      const result = parsePluginManifest(raw)
      assert.equal(result.ok, true, JSON.stringify(result))
      assert.equal(satisfiesOrcaEngineRange('1.4.214', raw.engines.orca), false)
      assert.equal(satisfiesOrcaEngineRange('1.4.246', raw.engines.orca), true)
      assert.equal(parsePluginManifest({ ...raw, engines: { orca: '>=1.4.214' } }).ok, false)
    } finally {
      hooks.deregister()
    }
  }
)
