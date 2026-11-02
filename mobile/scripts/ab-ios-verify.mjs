import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  readPlist,
  readProvisioningProfile,
  validateProvisioningProfile
} from './ab-ios-signing.mjs'

export function inspectApp(appPath, identity) {
  const info = readPlist(fs.readFileSync(path.join(appPath, 'Info.plist')))
  if (info.CFBundleIdentifier !== identity.bundleIdentifier) {
    throw new Error('The built app bundle identifier does not match AB_IOS_BUNDLE_ID.')
  }
  if (
    info.CFBundleShortVersionString !== identity.version ||
    info.CFBundleVersion !== identity.buildNumber
  ) {
    throw new Error('The built app version/build number does not match the requested AB identity.')
  }
  if (info.CFBundleSupportedPlatforms?.[0] !== 'iPhoneOS') {
    throw new Error('The app was not built for a physical iOS device.')
  }
  if (info.MinimumOSVersion !== identity.minimumIos) {
    throw new Error(
      'The built app minimum iOS version differs from the configured deployment target.'
    )
  }
  const binary = path.join(appPath, info.CFBundleExecutable)
  const arch = spawnSync('lipo', ['-archs', binary], { encoding: 'utf8' })
  if (arch.error || arch.status !== 0 || !arch.stdout.trim().split(/\s+/).includes('arm64')) {
    throw new Error('The app executable is missing the iPhone arm64 architecture.')
  }
  if (!fs.existsSync(path.join(appPath, 'main.jsbundle'))) {
    throw new Error('The standalone Release JavaScript bundle is missing.')
  }
  return {
    bundleIdentifier: info.CFBundleIdentifier,
    version: info.CFBundleShortVersionString,
    buildNumber: info.CFBundleVersion,
    minimumIos: info.MinimumOSVersion,
    architecture: arch.stdout.trim(),
    standaloneJavaScriptBundle: true
  }
}

export function verifyIpa(ipaPath, { identity, method, deviceUdid, teamId }) {
  if (process.platform !== 'darwin') {
    throw new Error('IPA signature verification requires macOS Apple codesign tooling.')
  }
  const extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-ios-verify-'))
  try {
    const unzip = spawnSync('ditto', ['-x', '-k', path.resolve(ipaPath), extracted], {
      encoding: 'utf8'
    })
    if (unzip.error || unzip.status !== 0) {
      throw new Error('Could not extract the IPA.')
    }
    const payload = path.join(extracted, 'Payload')
    const apps = fs.readdirSync(payload).filter((entry) => entry.endsWith('.app'))
    if (apps.length !== 1) {
      throw new Error('Expected exactly one application in the IPA Payload.')
    }
    const appPath = path.join(payload, apps[0])
    const inspected = inspectApp(appPath, identity)
    const checked = spawnSync('codesign', ['--verify', '--deep', '--strict', appPath], {
      encoding: 'utf8'
    })
    if (checked.error || checked.status !== 0) {
      throw new Error('codesign verification of the exported IPA failed.')
    }
    const encoded = spawnSync('codesign', ['-d', '--entitlements', ':-', appPath], {
      encoding: 'utf8'
    })
    if (encoded.error || encoded.status !== 0) {
      throw new Error('The IPA signing entitlements could not be read.')
    }
    const entitlements = readPlist(encoded.stdout)
    const profile = readProvisioningProfile(path.join(appPath, 'embedded.mobileprovision'))
    const validated = validateProvisioningProfile(profile, {
      ...identity,
      method,
      deviceUdid,
      teamId
    })
    if (validated.blockers.length) {
      throw new Error(validated.blockers.join('\n'))
    }
    if (
      entitlements['application-identifier'] !== profile.Entitlements['application-identifier'] ||
      entitlements['com.apple.developer.team-identifier'] !== validated.teamId
    ) {
      throw new Error('The app signing identity and embedded profile disagree.')
    }
    if (
      identity.apsEnvironment === 'disabled'
        ? entitlements['aps-environment'] !== undefined
        : entitlements['aps-environment'] !== identity.apsEnvironment
    ) {
      throw new Error(
        'The exported app APNs entitlement differs from the requested AB configuration.'
      )
    }
    return {
      ...inspected,
      signed: true,
      method,
      profileExpiresAt: validated.expiresAt,
      intendedDeviceIncluded: method === 'app-store' ? null : true,
      sha256: createHash('sha256').update(fs.readFileSync(ipaPath)).digest('hex'),
      installedOnDevice: false
    }
  } finally {
    fs.rmSync(extracted, { recursive: true, force: true })
  }
}
