import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => tmpdir(), getAppPath: () => tmpdir() }
}))

import { CliInstaller } from './cli-installer'

it('leaves the existing Orca command intact when AB is asked to install or remove it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ab-cli-isolation-'))
  vi.stubGlobal('ORCA_DISTRIBUTION_ID', 'ab-brainmaster')
  const commandPath = join(root, '.local/bin/orca-ide')
  try {
    await mkdir(join(root, '.local/bin'), { recursive: true })
    await writeFile(commandPath, 'existing Orca command\n')
    const installer = new CliInstaller({
      platform: 'linux',
      isPackaged: true,
      userDataPath: join(root, 'ab-data'),
      resourcesPath: join(root, 'resources'),
      execPath: join(root, 'ab-brainmaster'),
      appPath: root,
      homePath: root,
      commandPathOverride: commandPath
    })
    expect(await installer.getStatus()).toMatchObject({ supported: false, state: 'unsupported' })
    await expect(installer.install()).rejects.toThrow('does not manage Orca CLI commands')
    expect(await installer.remove()).toMatchObject({ supported: false, state: 'unsupported' })
    expect(await readFile(commandPath, 'utf8')).toBe('existing Orca command\n')
  } finally {
    vi.unstubAllGlobals()
    await rm(root, { recursive: true, force: true })
  }
})
