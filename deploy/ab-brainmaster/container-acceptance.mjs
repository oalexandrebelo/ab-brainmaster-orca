import { spawnProcess, runProcess } from '@orca/process-host'
import { randomBytes } from 'node:crypto'

const name = `ab-runtime-${randomBytes(6).toString('hex')}`
const volumes = [`${name}-profile`, `${name}-workspaces`, `${name}-home`]
async function docker(args) {
  const result = await runProcess({ program: 'docker', args, timeoutMs: 180000 })
  if (result.code !== 0) {
    throw new Error(`Docker ${args[0]} failed: ${result.stderr}`)
  }
  return result.stdout.trim()
}
async function status() {
  const deadline = Date.now() + 150000
  while (Date.now() < deadline) {
    const result = await runProcess({
      program: 'docker',
      args: ['exec', name, 'node', '/opt/ab-release/ab-control/cli.mjs', 'status'],
      timeoutMs: 10000
    })
    if (result.code === 0) {
      return JSON.parse(result.stdout).result
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('Container did not become ready')
}
try {
  for (const volume of volumes) {
    await docker(['volume', 'create', volume])
  }
  await docker([
    'run',
    '--detach',
    '--name',
    name,
    '--network',
    'none',
    '--read-only',
    '--cpus',
    '2',
    '--memory',
    '3g',
    '--pids-limit',
    '256',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,size=256m,mode=1777',
    '--env',
    'AB_CONTROL_PUBLISHED_PORT=8080',
    '--volume',
    `${volumes[0]}:/var/lib/ab-brainmaster`,
    '--volume',
    `${volumes[1]}:/workspaces`,
    '--volume',
    `${volumes[2]}:/home/node`,
    'ab-brainmaster-orca:ci'
  ])
  const before = await status()
  await docker(['restart', '--time', '30', name])
  const after = await status()
  if (
    before.hostDescriptor.installationId !== after.hostDescriptor.installationId ||
    before.runtimeId === after.runtimeId
  ) {
    throw new Error(
      'Container restart did not preserve profile identity and replace runtime identity'
    )
  }
  const inspect = JSON.parse(await docker(['inspect', name]))[0]
  if (
    inspect.Config.User !== 'node' ||
    inspect.HostConfig.NetworkMode !== 'none' ||
    inspect.HostConfig.ReadonlyRootfs !== true
  ) {
    throw new Error('Container isolation does not match acceptance policy')
  }
  console.log(
    JSON.stringify({
      ok: true,
      isolation: 'network-none/nonroot/read-only',
      restarted: true,
      persistentInstallationId: after.hostDescriptor.installationId
    })
  )
} catch (error) {
  const logs = spawnProcess({ program: 'docker', args: ['logs', name], stdio: 'inherit' })
  await new Promise((resolve) => logs.once('close', resolve))
  throw error
} finally {
  await docker(['rm', '--force', name]).catch(() => {})
  for (const volume of volumes) {
    await docker(['volume', 'rm', volume]).catch(() => {})
  }
}
