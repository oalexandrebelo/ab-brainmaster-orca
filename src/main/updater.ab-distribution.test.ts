import { afterEach, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'
import { updaterMainWindow } from './updater-test-main-window'

const mocks = await vi.hoisted(async () =>
  (await import('./updater-test-harness')).createUpdaterMocks()
)

vi.mock('electron', () => mocks.moduleFactories.electron())
vi.mock('electron-updater', () => mocks.moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => mocks.moduleFactories.electronUpdaterLoader())
vi.mock('./ipc/pty/kill-all', () => mocks.moduleFactories.ptyKillAll())
vi.mock('./linux-update-package-type', () => mocks.moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () =>
  mocks.moduleFactories.updaterLifecycleDiagnostics()
)
vi.mock('./updater-changelog', () => mocks.moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => mocks.moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => mocks.moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => mocks.moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => mocks.moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () =>
  mocks.moduleFactories.localBuildFeedServer()
)

warmUpdaterModule()
afterEach(() => vi.unstubAllGlobals())

it('refuses upstream checks, build switching and installation in the AB distribution', async () => {
  mocks.resetUpdaterMocks()
  vi.stubGlobal('ORCA_DISTRIBUTION_ID', 'ab-brainmaster')
  const updater = await loadUpdaterModule()
  updater.setupAutoUpdater(updaterMainWindow(vi.fn()))
  updater.checkForUpdates()
  updater.checkForUpdatesFromMenu()
  updater.checkForUpdatesFromMenu({ localBuild: true })
  updater.checkForUpdatesFromMenu({ channel: 'stable', targetTag: 'v1.4.999' })
  updater.downloadUpdate()
  updater.quitAndInstall()

  expect(await updater.listAvailableReleaseBuilds('stable')).toEqual([])
  expect(updater.getRemoteServerUpdateSupport()).toMatchObject({ automatic: false })
  expect(() => updater.checkForRemoteServerUpdate('ab-runtime')).toThrow(
    'remote_update_manual_required'
  )
  expect(updater.getUpdateStatus()).toMatchObject({
    state: 'error',
    message: expect.stringContaining('AB Brainmaster development build')
  })
  expect(mocks.autoUpdaterMock.setFeedURL).not.toHaveBeenCalled()
  expect(mocks.autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  expect(mocks.autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
  expect(mocks.autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
  expect(mocks.fetchNewerReleaseTagsMock).not.toHaveBeenCalled()
  expect(mocks.fetchNudgeMock).not.toHaveBeenCalled()
  expect(mocks.chooseLocalBuildMock).not.toHaveBeenCalled()
  expect(mocks.powerMonitorOnMock).not.toHaveBeenCalled()
})
