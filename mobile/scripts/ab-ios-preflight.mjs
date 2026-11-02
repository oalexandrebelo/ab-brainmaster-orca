import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolveAbIosIdentity } from '../config/ab-ios-identity.cjs'
import {
  EXPORT_METHODS,
  readProvisioningProfile,
  validateProvisioningProfile
} from './ab-ios-signing.mjs'

export const mobileRoot = path.resolve(import.meta.dirname, '..')

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: mobileRoot,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024
  })
  return !result.error && result.status === 0 ? result.stdout.trim() : null
}

export function collectPreflight({ method = 'ad-hoc', unsigned = false, env = process.env } = {}) {
  if (!EXPORT_METHODS[method]) {
    throw new Error('The export method must be development, ad-hoc, or app-store.')
  }
  const identity = resolveAbIosIdentity(env)
  const blockers = []
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    platform: process.platform,
    identity,
    method,
    unsigned,
    blockers,
    tools: {},
    connectedDevices: []
  }
  if (Number(process.versions.node.split('.')[0]) < 24) {
    blockers.push('Node.js 24 or newer is required.')
  }
  report.tools.node = process.version
  const expectedPnpm = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'))
    .packageManager.split('@')[1]
    .split('+')[0]
  report.tools.pnpm = capture(env.AB_IOS_PNPM_BIN || 'pnpm', ['--version'])
  if (report.tools.pnpm !== expectedPnpm) {
    blockers.push(
      `Install the lockfile with pnpm ${expectedPnpm}; set AB_IOS_PNPM_BIN if it is not on PATH.`
    )
  }
  if (!fs.existsSync(path.join(mobileRoot, 'node_modules/expo/bin/cli'))) {
    blockers.push('Install mobile dependencies using pnpm install --frozen-lockfile.')
  }
  if (process.platform !== 'darwin') {
    blockers.push(
      'Native iOS archives and signing require macOS with full Xcode; this host is not macOS.'
    )
    return { report, signing: null }
  }
  report.tools.macos = capture('sw_vers', ['-productVersion'])
  report.tools.xcode = capture('xcodebuild', ['-version'])
  const version = report.tools.xcode?.match(/Xcode (\d+)\.(\d+)/)
  if (
    !version ||
    Number(version[1]) < 26 ||
    (Number(version[1]) === 26 && Number(version[2]) < 2)
  ) {
    blockers.push(
      'Expo SDK 55 requires Xcode 26.2 or newer, selected using DEVELOPER_DIR or xcode-select.'
    )
  }
  report.tools.iphoneosSdk = capture('xcrun', ['--sdk', 'iphoneos', '--show-sdk-version'])
  if (!report.tools.iphoneosSdk) {
    blockers.push('The selected Xcode has no usable iPhoneOS SDK.')
  }
  if (capture('xcodebuild', ['-checkFirstLaunchStatus']) === null) {
    blockers.push('Complete Xcode first launch and accept its license in Xcode before building.')
  }
  report.tools.ruby = capture('ruby', ['--version'])
  report.tools.bundler = capture('bundle', ['--version'])
  if (!report.tools.bundler) {
    blockers.push('Install Bundler and run BUNDLE_FROZEN=true bundle install in mobile/.')
  } else if (capture('bundle', ['check']) === null) {
    blockers.push(
      'Install the locked mobile/Gemfile dependencies with BUNDLE_FROZEN=true bundle install.'
    )
  }
  const rawDevices = capture('xcrun', ['xcdevice', 'list'])
  if (rawDevices) {
    try {
      report.connectedDevices = JSON.parse(rawDevices)
        .filter((device) => !device.simulator && device.platform === 'com.apple.platform.iphoneos')
        .map((device) => ({
          model: device.modelCode,
          osVersion: device.operatingSystemVersion,
          available: device.available,
          intendedDevice: Boolean(
            env.AB_IOS_DEVICE_UDID && device.identifier === env.AB_IOS_DEVICE_UDID
          )
        }))
    } catch {
      report.deviceInventoryUnavailable = true
    }
  }
  if (unsigned) {
    return { report, signing: null }
  }
  if (!env.AB_IOS_PROFILE || !fs.existsSync(env.AB_IOS_PROFILE)) {
    blockers.push(
      'Set AB_IOS_PROFILE to an existing Apple .mobileprovision file for this AB app and device.'
    )
    return { report, signing: null }
  }
  let profile
  try {
    profile = readProvisioningProfile(env.AB_IOS_PROFILE)
  } catch (error) {
    blockers.push(error.message)
    return { report, signing: null }
  }
  const validated = validateProvisioningProfile(profile, {
    ...identity,
    method,
    teamId: env.APPLE_TEAM_ID,
    deviceUdid: env.AB_IOS_DEVICE_UDID
  })
  blockers.push(...validated.blockers)
  report.profile = {
    expiresAt: validated.expiresAt,
    registeredDeviceCount: validated.registeredDeviceCount,
    requestedDeviceIncluded: Boolean(
      env.AB_IOS_DEVICE_UDID && profile.ProvisionedDevices?.includes(env.AB_IOS_DEVICE_UDID)
    )
  }
  const certificates = (profile.DeveloperCertificates ?? []).map((certificate) =>
    createHash('sha1').update(Buffer.from(certificate, 'base64')).digest('hex').toUpperCase()
  )
  const identities = capture('security', ['find-identity', '-v', '-p', 'codesigning']) ?? ''
  const identityHash = certificates.find(
    (hash) =>
      identities.includes(hash) &&
      (!env.AB_IOS_SIGNING_IDENTITY || env.AB_IOS_SIGNING_IDENTITY.toUpperCase() === hash)
  )
  if (!identityHash) {
    blockers.push(
      'The keychain has no valid signing identity/private key matching a certificate in this profile.'
    )
  }
  report.matchingSigningIdentityPresent = Boolean(identityHash)
  return {
    report,
    signing: { ...validated, identityHash, profilePath: path.resolve(env.AB_IOS_PROFILE) }
  }
}
