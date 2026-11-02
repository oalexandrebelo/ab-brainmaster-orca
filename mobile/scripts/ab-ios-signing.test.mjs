import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { validateProvisioningProfile, exportOptionsPlist } from './ab-ios-signing.mjs'

const require = createRequire(import.meta.url)
const { resolveAbIosIdentity, applyAbIosIdentity } = require('../config/ab-ios-identity.cjs')
const config = require('../app.json').expo
const identity = resolveAbIosIdentity({})
const options = {
  ...identity,
  method: 'ad-hoc',
  deviceUdid: 'fixture-device',
  now: Date.parse('2026-11-02T00:00:00Z')
}
const valid = {
  Name: 'AB fixture profile',
  UUID: '00000000-0000-0000-0000-000000000001',
  TeamIdentifier: ['AB12345678'],
  ApplicationIdentifierPrefix: ['AB12345678'],
  Platform: ['iOS'],
  ExpirationDate: '2027-01-01T00:00:00Z',
  ProvisionedDevices: ['fixture-device'],
  Entitlements: {
    'application-identifier': `AB12345678.${identity.bundleIdentifier}`,
    'get-task-allow': false
  }
}

test('AB config keeps the app identity separate and preserves the upstream source object', () => {
  const previous = JSON.stringify(config)
  const result = applyAbIosIdentity(config, {})
  assert.equal(result.ios.bundleIdentifier, identity.bundleIdentifier)
  assert.equal(result.scheme, 'ab-brainmaster-orca')
  assert.equal(result.extra.abBrainmaster.pushEnabled, false)
  assert.match(result.locales['pt-BR'].ios.NSLocalNetworkUsageDescription, /AB BRAINMASTER/)
  assert.equal(JSON.stringify(config), previous)
})

test('AB identity rejects upstream bundle IDs, wildcard IDs, and malformed releases', () => {
  for (const env of [
    { AB_IOS_BUNDLE_ID: 'com.stably.orca.mobile' },
    { AB_IOS_BUNDLE_ID: 'br.example.*' },
    { AB_IOS_APS_ENVIRONMENT: 'sandbox' },
    { AB_IOS_VERSION: '1.0.beta' },
    { AB_IOS_BUILD_NUMBER: '0' }
  ]) {
    assert.throws(() => resolveAbIosIdentity(env))
  }
})

test('resolved AB Expo config never grants APNs when remote push is disabled', () => {
  const previous = { variant: process.env.AB_IOS_VARIANT, aps: process.env.AB_IOS_APS_ENVIRONMENT }
  try {
    process.env.AB_IOS_VARIANT = 'brainmaster'
    process.env.AB_IOS_APS_ENVIRONMENT = 'disabled'
    delete require.cache[require.resolve('../app.config.js')]
    const expo = require('../app.config.js')({ config })
    assert.equal(expo.ios.entitlements['aps-environment'], undefined)
    assert.ok(
      !expo.plugins.some(
        (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-notifications'
      )
    )
  } finally {
    if (previous.variant === undefined) {
      delete process.env.AB_IOS_VARIANT
    } else {
      process.env.AB_IOS_VARIANT = previous.variant
    }
    if (previous.aps === undefined) {
      delete process.env.AB_IOS_APS_ENVIRONMENT
    } else {
      process.env.AB_IOS_APS_ENVIRONMENT = previous.aps
    }
    delete require.cache[require.resolve('../app.config.js')]
  }
})

test('valid explicit ad hoc profile includes the intended device', () => {
  assert.deepEqual(validateProvisioningProfile(valid, options).blockers, [])
})

test('ad hoc refuses a missing or unregistered iPhone', () => {
  for (const deviceUdid of ['', 'other-device']) {
    assert.ok(validateProvisioningProfile(valid, { ...options, deviceUdid }).blockers.length)
  }
})

test('profile refuses another app, wildcard, team, or expired profile', () => {
  for (const patch of [
    { ExpirationDate: '2025-01-01T00:00:00Z' },
    { Entitlements: { 'application-identifier': 'AB12345678.*' } },
    { Entitlements: { 'application-identifier': 'AB12345678.com.stably.orca.mobile' } },
    { ProvisionsAllDevices: true }
  ]) {
    assert.ok(validateProvisioningProfile({ ...valid, ...patch }, options).blockers.length)
  }
  assert.ok(
    validateProvisioningProfile(valid, { ...options, teamId: 'OTHER12345' }).blockers.length
  )
})

test('development, ad hoc, and App Store profiles are not interchangeable', () => {
  assert.ok(
    validateProvisioningProfile(valid, { ...options, method: 'development' }).blockers.length
  )
  assert.ok(validateProvisioningProfile(valid, { ...options, method: 'app-store' }).blockers.length)
  assert.deepEqual(
    validateProvisioningProfile(
      { ...valid, ProvisionedDevices: undefined },
      { ...options, method: 'app-store' }
    ).blockers,
    []
  )
})

test('push capability needs matching profile, build configuration, and distribution method', () => {
  assert.ok(
    validateProvisioningProfile(valid, { ...options, apsEnvironment: 'production' }).blockers.length
  )
  const production = {
    ...valid,
    Entitlements: { ...valid.Entitlements, 'aps-environment': 'production' }
  }
  assert.deepEqual(
    validateProvisioningProfile(production, { ...options, apsEnvironment: 'production' }).blockers,
    []
  )
  assert.ok(
    validateProvisioningProfile(production, { ...options, apsEnvironment: 'development' }).blockers
      .length
  )
})

test('export options export locally with explicit manual signing and immutable version', () => {
  const xml = exportOptionsPlist({
    method: 'ad-hoc',
    teamId: 'AB12345678',
    bundleIdentifier: identity.bundleIdentifier,
    profileUuid: valid.UUID,
    identityHash: 'A'.repeat(40)
  })
  assert.match(xml, /release-testing/)
  assert.match(xml, /<key>destination<\/key><string>export<\/string>/)
  assert.match(xml, /<key>manageAppVersionAndBuildNumber<\/key><false\/>/)
  assert.doesNotMatch(xml, /upload|automatic/)
})

test('workflow cannot sign or upload to Apple and pins every action to a SHA', () => {
  const workflow = fs.readFileSync(
    new URL('../../.github/workflows/ab-ios-native.yml', import.meta.url),
    'utf8'
  )
  assert.match(workflow, /build --unsigned/)
  assert.doesNotMatch(workflow, /secrets\.|allowProvisioningUpdates|upload_to_testflight/)
  for (const match of workflow.matchAll(/uses: (\S+)/g)) {
    assert.match(match[1], /@[a-f0-9]{40}$/)
  }
})
