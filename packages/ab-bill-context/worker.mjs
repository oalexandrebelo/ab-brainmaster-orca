import { fileURLToPath } from 'node:url'
import {
  normalizeSetup,
  decideLaunch,
  AUDITED_BILI_VERSION,
  REQUIRED_ORCA_VERSION
} from './contracts.mjs'
import { prepareRuntime, assertFingerprint } from './runtime.mjs'

export default async function activate(orca) {
  const state = { enabled: false, ready: false, plan: null, planPath: null, error: null }
  const runnerPath = fileURLToPath(new URL('./launch.mjs', import.meta.url))
  const publicState = () => ({
    enabled: state.enabled,
    ready: state.ready,
    error: state.error,
    workspaceId: state.plan?.workspaceId ?? null,
    preparedAt: state.plan?.preparedAt ?? null,
    biliVersion: state.plan?.biliVersion ?? null,
    requiredOrca: REQUIRED_ORCA_VERSION,
    auditedBili: AUDITED_BILI_VERSION
  })
  const publish = () => orca.panels.post('context.changed', publicState())

  orca.hooks.on('agent.launch.before', (event, next) => {
    if (state.enabled && state.ready && state.plan?.workspaceId === event.workspaceId) {
      try {
        assertFingerprint(state.plan)
      } catch (error) {
        state.ready = false
        state.error = error.message
      }
    }
    const decision = decideLaunch(event, state, runnerPath)
    if (decision.kind === 'deny') {
      return { deny: decision.reason }
    }
    if (decision.kind === 'rewrite') {
      return next({ ...event, command: decision.command })
    }
  })

  const stored = await orca.storage.get('preparedLaunch')
  if (stored?.plan && stored?.planPath) {
    if (!/^folder:.+/u.test(stored.plan.workspaceId)) {
      state.error =
        'O plano salvo não corresponde a um workspace de pasta suportado. Prepare novamente.'
    } else {
      state.plan = stored.plan
      state.planPath = stored.planPath
      try {
        assertFingerprint(state.plan)
        state.ready = true
      } catch (error) {
        state.error = error.message
      }
    }
  }
  state.enabled = (await orca.settings.get('enabled')) === true

  orca.settings.onDidChange(async ({ key }) => {
    if (key === 'enabled') {
      state.enabled = (await orca.settings.get('enabled')) === true
      publish()
    }
  })
  orca.panels.handle('context.state', () => publicState())
  orca.panels.handle('context.workspaces', () => orca.host.call('workspace.list', {}))
  orca.panels.handle('context.prepare', async (input) => {
    state.ready = false
    state.error = null
    try {
      const { workspaces } = await orca.host.call('workspace.list', {})
      const setup = normalizeSetup(
        input,
        workspaces.find((item) => item.id === input.workspaceId)
      )
      const prepared = await prepareRuntime(setup)
      await orca.storage.set('preparedLaunch', prepared)
      Object.assign(state, prepared, { ready: true })
      publish()
      return publicState()
    } catch (error) {
      state.error = error.code
        ? `Preparação falhou (${error.code}). Confira os caminhos e as versões.`
        : error.message
      publish()
      throw new Error(state.error)
    }
  })
  orca.panels.handle('context.enable', async ({ enabled }) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Estado inválido.')
    }
    if (enabled) {
      if (!state.ready) {
        throw new Error('Verifique a configuração antes de ligar.')
      }
      assertFingerprint(state.plan)
    }
    await orca.settings.set('enabled', enabled)
    state.enabled = enabled
    publish()
    return publicState()
  })
  orca.commands.register('context-disable', async () => {
    await orca.settings.set('enabled', false)
    state.enabled = false
    publish()
    return 'Contexto desligado para novos terminais. As sessões abertas continuam com seus proxies.'
  })
}
