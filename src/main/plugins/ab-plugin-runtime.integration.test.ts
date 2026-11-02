import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { expect, it } from 'vitest'
import { pluginHostVersion } from '../../shared/plugins/installation/plugin-host-version'
import { installPluginFromLocalPath } from './installation/plugin-install'
import { PluginService } from './plugin-service'

// Builds and starts two real worker processes, including their shutdown on slower CI hosts.
it('installs both AB modules and runs their actual workers through the host approval and panel bridges', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ab-plugin-runtime-'))
  const { version } = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'))
  const hostVersion = pluginHostVersion(version)
  const hostEntryPath = join(root, 'plugin-host-entry.cjs')
  const consents: Record<string, string> = {}
  const keys: Record<string, string> = {}
  let service: PluginService | undefined
  try {
    await build({
      entryPoints: [join(process.cwd(), 'src/main/plugins/workers/plugin-host-entry.ts')],
      outfile: hostEntryPath,
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'cjs',
      logLevel: 'silent'
    })
    for (const module of ['ab-bill-context', 'ab-upstream-review']) {
      const installed = await installPluginFromLocalPath({
        pluginsDir: join(root, 'plugins'),
        sourcePath: join(process.cwd(), 'packages', module),
        hostVersion
      })
      if (!installed.ok) {
        throw new Error(installed.error)
      }
      keys[module] = installed.pluginKey
      consents[installed.pluginKey] = installed.consentFingerprint
    }
    service = new PluginService({
      userDataPath: root,
      hostVersion,
      hostEntryPath,
      isPluginSystemEnabled: () => true,
      getDisabledPlugins: () => [],
      getPluginConsents: () => ({}),
      getDevPluginPaths: () => []
    })
    const outsideProbe = async (): Promise<never> => {
      throw new Error('Workspace and terminal actions are outside this storage/worker probe.')
    }
    service.setRuntimeDelegate({
      resolveActiveWorktreeContext: outsideProbe,
      listTerminals: outsideProbe,
      sendTerminal: outsideProbe,
      dispatchPluginNotification: outsideProbe
    })
    await service.initialize()
    for (const key of Object.values(keys)) {
      expect(service.findApprovedPlugin(key)).toBeNull()
      expect(service.workerState(key).state).not.toBe('running')
    }
    service.options.getPluginConsents = () => consents
    await service.refresh()
    for (const key of Object.values(keys)) {
      expect(service.findApprovedPlugin(key)).not.toBeNull()
      expect(service.activationError(key)).toBeNull()
    }
    const contextKey = keys['ab-bill-context']
    const contextCaller = {
      id: 'ab-context-probe',
      surface: 'panel' as const,
      contributionId: 'context'
    }
    expect(await service.panels.readEntry(contextKey, 'context')).not.toBeNull()
    const state = await service.panelBridge.request({
      pluginKey: contextKey,
      caller: contextCaller,
      name: 'context.state',
      input: null
    })
    expect(state).toMatchObject({ enabled: false, ready: false, workspaceId: null })
    await expect(
      service.panelBridge.request({
        pluginKey: contextKey,
        caller: contextCaller,
        name: 'context.enable',
        input: { enabled: true }
      })
    ).rejects.toThrow('Verifique a configuração antes de ligar')
    await expect(service.invokeCommand(contextKey, 'context-disable')).resolves.toContain(
      'Contexto desligado'
    )
    const reviewKey = keys['ab-upstream-review']
    expect(await service.panels.readEntry(reviewKey, 'upstream')).not.toBeNull()
    await expect(
      service.panelBridge.request({
        pluginKey: reviewKey,
        caller: { id: 'ab-upstream-probe', surface: 'panel', contributionId: 'upstream' },
        name: 'upstream.review',
        input: { confirmed: false }
      })
    ).rejects.toThrow('Confirme a ação explícita de revisão')
    for (const key of Object.values(keys)) {
      expect(service.workerState(key)).toEqual({ state: 'running', restarts: 0 })
    }
  } finally {
    await service?.dispose()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
