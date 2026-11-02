import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDistributionIdentity } from '../../src/shared/distribution-identity'
import { getDevInstanceIdentity } from '../../src/main/startup/dev-instance-identity'
import { registerOrcaProtocolClient } from '../../src/main/startup/orca-protocol-registration'

const require = createRequire(import.meta.url)
const {
  resolveDistributionIdentity,
  distributionBuildDefines
} = require('../distribution-identity.cjs')

afterEach(() => vi.unstubAllGlobals())

describe('distribution identity', () => {
  it('keeps the Orca target and rejects unknown distributions', () => {
    expect(getDistributionIdentity()).toEqual(resolveDistributionIdentity('orca'))
    expect(() => resolveDistributionIdentity('unknown')).toThrow('Unknown Orca distribution')
  })

  it('uses one identity for AB desktop, build metadata and profile defaults', () => {
    vi.stubGlobal('ORCA_DISTRIBUTION_ID', 'ab-brainmaster')
    const identity = getDistributionIdentity()
    expect(identity).toEqual(resolveDistributionIdentity('ab-brainmaster'))
    expect(getDevInstanceIdentity(false, {})).toMatchObject({
      name: identity.productName,
      appName: identity.productName,
      appUserModelId: identity.appId
    })
    expect(getDevInstanceIdentity(true, { ORCA_DEV_REPO_ROOT: '/work/ab' })).toMatchObject({
      appName: 'AB Brainmaster Dev',
      appUserModelId: expect.stringMatching(/^io\.github\.oalexandrebelo\.abbrainmaster\.dev\./)
    })
    expect(identity.profileDirectory).toBe('ab-brainmaster')
    expect(identity.devProfileDirectory).toBe('ab-brainmaster-dev')
  })

  it('does not register the upstream protocol for AB on Windows', () => {
    vi.stubGlobal('ORCA_DISTRIBUTION_ID', 'ab-brainmaster')
    const app = {
      isPackaged: true,
      isDefaultProtocolClient: vi.fn(() => false),
      setAsDefaultProtocolClient: vi.fn(() => true)
    }
    expect(registerOrcaProtocolClient(app, { platform: 'win32', desktopLaunch: true })).toBe(false)
    expect(app.isDefaultProtocolClient).not.toHaveBeenCalled()
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled()
  })

  it('excludes upstream telemetry and diagnostic credentials from AB build constants', () => {
    const env = {
      ORCA_BUILD_IDENTITY: 'stable',
      ORCA_POSTHOG_WRITE_KEY: 'upstream-test-key',
      ORCA_DIAGNOSTICS_TOKEN_URL: 'https://example.com/token'
    }
    expect(distributionBuildDefines(resolveDistributionIdentity('ab-brainmaster'), env)).toEqual({
      ORCA_BUILD_IDENTITY: 'null',
      ORCA_POSTHOG_WRITE_KEY: 'null',
      ORCA_DIAGNOSTICS_TOKEN_URL: 'null'
    })
    expect(distributionBuildDefines(resolveDistributionIdentity('orca'), env)).toEqual({
      ORCA_BUILD_IDENTITY: '"stable"',
      ORCA_POSTHOG_WRITE_KEY: '"upstream-test-key"',
      ORCA_DIAGNOSTICS_TOKEN_URL: '"https://example.com/token"'
    })
  })

  it('separates AB packaging and refuses unqualified installer targets', () => {
    const config = require('../electron-builder.ab.config.cjs')
    expect(config).toMatchObject({
      appId: 'io.github.oalexandrebelo.abbrainmaster',
      productName: 'AB Brainmaster',
      publish: null,
      protocols: [],
      extraMetadata: { name: 'ab-brainmaster' },
      linux: { executableName: 'ab-brainmaster', target: ['dir'] }
    })
    expect(() => config.beforePack({ electronPlatformName: 'darwin' })).toThrow(
      'Linux directory builds only'
    )
    expect(() => config.beforePack({ electronPlatformName: 'win32' })).toThrow(
      'Linux directory builds only'
    )
    expect(() =>
      config.beforePack({ electronPlatformName: 'linux', targets: [{ name: 'deb' }] })
    ).toThrow('Linux directory builds only')
  })
})
