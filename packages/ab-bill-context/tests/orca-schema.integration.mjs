import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { normalizeSetup, decideLaunch } from '../contracts.mjs'

const source = process.env.AB_ORCA_TEST_SOURCE,
  zod = process.env.AB_ORCA_TEST_ZOD

test(
  'manifest and workspace policy respect the real Orca schema, folder keys and Git identities',
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
      const { parsePluginManifest, satisfiesOrcaEngineRange } = await import(
        pathToFileURL(path.join(source, 'src/shared/plugins/manifest/plugin-manifest.ts')).href
      )
      const raw = JSON.parse(
        await fs.readFile(new URL('../orca-plugin.json', import.meta.url), 'utf8')
      )
      const result = parsePluginManifest(raw)
      assert.equal(result.ok, true, JSON.stringify(result))
      assert.equal(satisfiesOrcaEngineRange('1.4.214', raw.engines.orca), false)
      assert.equal(satisfiesOrcaEngineRange('1.4.248', raw.engines.orca), true)
      assert.equal(parsePluginManifest({ ...raw, engines: { orca: '>=1.4.214' } }).ok, false)
      const { pluginHostVersion } = await import(
        pathToFileURL(path.join(source, 'src/shared/plugins/installation/plugin-host-version.ts'))
          .href
      )
      const { version } = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'))
      assert.equal(satisfiesOrcaEngineRange(pluginHostVersion(version), raw.engines.orca), true)
      const { folderWorkspaceKey } = await import(
        pathToFileURL(path.join(source, 'src/shared/workspace-scope.ts')).href
      )
      const { createWorktreeIdentity } = await import(
        pathToFileURL(path.join(source, 'src/shared/worktree/identity.ts')).href
      )
      const folderId = folderWorkspaceKey('chosen-folder')
      const setup = {
        workspaceId: folderId,
        nodePath: '/opt/node',
        biliEntry: '/opt/bili/dist/index.js',
        claudePath: '/opt/claude',
        dataDirectory: '/private/sessions',
        upstream: 'https://example.invalid',
        contextWindow: 16000
      }
      const plan = normalizeSetup(
        setup,
        { id: folderId, kind: 'folder', hostId: 'local', path: '/workspace/project' },
        'linux'
      )
      assert.equal(
        decideLaunch(
          { agent: 'claude', workspaceId: folderId, command: 'claude' },
          { enabled: true, ready: true, plan, planPath: '/private/plan' },
          '/runner'
        ).kind,
        'rewrite'
      )
      const rawWorktreeId = 'repo-id::/workspace/project'
      const identity = createWorktreeIdentity({
        worktreeId: rawWorktreeId,
        executionHostId: 'local',
        instanceId: 'instance-id'
      })
      const listedId = `identity:${identity.key}`
      assert.notEqual(listedId, rawWorktreeId)
      assert.throws(
        () =>
          normalizeSetup(
            { ...setup, workspaceId: listedId },
            { id: listedId, kind: 'worktree', hostId: 'local', path: '/workspace/project' },
            'linux'
          ),
        /workspaces de pasta/u
      )
    } finally {
      hooks.deregister()
    }
  }
)
