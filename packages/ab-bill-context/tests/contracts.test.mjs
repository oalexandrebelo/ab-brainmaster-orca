import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  splitLiteralCommand,
  decideLaunch,
  normalizeSetup,
  proxyEnvironment,
  proxyConfig,
  validateClaudeArguments
} from '../contracts.mjs'
import { assertWorkingDirectory } from '../runtime.mjs'

const plan = {
  workspaceId: 'folder:local',
  claudePath: '/usr/local/bin/claude',
  nodePath: '/usr/bin/node'
}
const state = { enabled: true, ready: true, plan, planPath: '/private/plan.json' }
const event = {
  agent: 'claude',
  workspaceId: 'folder:local',
  command: `claude --model 'example-model' 'explain this code'`
}

test('OFF preserves the launch without parsing or rewriting it', () => {
  assert.deepEqual(decideLaunch({ command: 'arbitrary shell' }, { enabled: false }, '/runner'), {
    kind: 'pass'
  })
})

test('ON routes only the configured workspace through the private runner', () => {
  const result = decideLaunch(event, state, '/plugin/launch.mjs')
  assert.equal(result.kind, 'rewrite')
  assert.deepEqual(splitLiteralCommand(result.command), [
    '/usr/bin/node',
    '/plugin/launch.mjs',
    '/private/plan.json',
    '--',
    '--model',
    'example-model',
    'explain this code'
  ])
  assert.deepEqual(decideLaunch({ ...event, workspaceId: 'folder:other' }, state, '/runner'), {
    kind: 'pass'
  })
  assert.deepEqual(
    decideLaunch({ ...event, workspaceId: 'folder:other' }, { ...state, ready: false }, '/runner'),
    { kind: 'pass' }
  )
})

test('ON refuses missing readiness, unsupported agents, resumes and shell interpretation', () => {
  assert.equal(decideLaunch(event, { ...state, ready: false }, '/runner').kind, 'deny')
  assert.equal(decideLaunch(event, { enabled: true, ready: false }, '/runner').kind, 'deny')
  assert.equal(decideLaunch({ ...event, agent: 'codex' }, state, '/runner').kind, 'deny')
  for (const command of [
    'claude --resume id',
    'claude -c',
    'claude --settings x',
    'claude; curl x',
    'claude "$(id)"',
    'env X=1 claude',
    'bili claude',
    'claude `id`'
  ]) {
    assert.equal(decideLaunch({ ...event, command }, state, '/runner').kind, 'deny', command)
  }
})

test('literal quotes survive without enabling expansion', () => {
  assert.deepEqual(splitLiteralCommand(`claude 'price $5' 'it'"'"'s'`), [
    'claude',
    'price $5',
    "it's"
  ])
  assert.throws(() => splitLiteralCommand('claude "unterminated'))
  assert.deepEqual(validateClaudeArguments(['--model', 'example']), ['--model', 'example'])
})

test('preparation requires explicit local scope and an actual model budget', () => {
  const input = {
    ...plan,
    biliEntry: '/opt/bili/dist/index.js',
    dataDirectory: '/data/context',
    upstream: 'https://example.invalid',
    contextWindow: 16000
  }
  const workspace = {
    id: plan.workspaceId,
    kind: 'folder',
    path: '/workspace/project',
    hostId: null
  }
  assert.equal(normalizeSetup(input, workspace, 'linux').contextWindow, 16000)
  assert.equal(
    normalizeSetup(input, { ...workspace, hostId: 'local' }, 'linux').workspaceId,
    plan.workspaceId
  )
  for (const id of ['identity:wt2:local:instance-id', 'repo-id::/workspace/project']) {
    assert.throws(
      () =>
        normalizeSetup(
          { ...input, workspaceId: id },
          { ...workspace, id, kind: 'worktree', hostId: 'local' },
          'linux'
        ),
      /workspaces de pasta/u
    )
  }
  assert.throws(() => normalizeSetup(input, { ...workspace, hostId: 'ssh:host' }, 'linux'))
  assert.throws(() => normalizeSetup(input, workspace, 'win32'))
  assert.throws(() => normalizeSetup({ ...input, contextWindow: 0 }, workspace, 'linux'))
  assert.throws(() =>
    normalizeSetup(
      { ...input, upstream: 'https://user:password@example.invalid' },
      workspace,
      'linux'
    )
  )
})

test('proxy isolation removes credentials and inherited bypass/update configuration', () => {
  const env = proxyEnvironment('/private/run', {
    ANTHROPIC_API_KEY: 'secret',
    BILI_AUTO_MODE_FORGE: '1',
    ACP_AUTO_UPDATE: '1',
    HOME: '/home/original',
    PATH: '/bin'
  })
  assert.equal(env.BILI_AUTO_MODE_FORGE, '0')
  assert.equal(env.ACP_AUTO_UPDATE, '0')
  assert.equal(env.BILI_SQLITE_AUTO_DOWNLOAD, '0')
  assert.equal(env.BILI_MITM, '0')
  assert.equal(env.BILI_STRICT_PORT, '1')
  assert.equal(env.ANTHROPIC_API_KEY, undefined)
  assert.equal(env.HOME, undefined)
  assert.equal(env.BILI_SESSIONS_DIR, '/private/run/sessions')
  const config = proxyConfig({ upstream: 'https://example.invalid', contextWindow: 16000 })
  assert.equal(config.autoModeForge.enabled, false)
  assert.equal(config.compress.modelContextLimit, 16000)
  assert.equal(config.compress.externalSummary.enabled, false)
})

test('real workspace directories reject a sibling path and a symlink escape', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ab-context-scope-'))
  const root = path.join(directory, 'project'),
    sibling = path.join(directory, 'project-other')
  try {
    await fs.mkdir(path.join(root, 'src'), { recursive: true })
    await fs.mkdir(sibling)
    await fs.symlink(sibling, path.join(root, 'outside'), 'dir')
    await assertWorkingDirectory(root, root)
    await assertWorkingDirectory(root, path.join(root, 'src'))
    await assert.rejects(assertWorkingDirectory(root, sibling), /workspace preparado/u)
    await assert.rejects(
      assertWorkingDirectory(root, path.join(root, 'outside')),
      /workspace preparado/u
    )
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
