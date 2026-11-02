import { spawnSync } from 'node:child_process'

export const EXPORT_METHODS = {
  development: 'debugging',
  'ad-hoc': 'release-testing',
  'app-store': 'app-store-connect'
}

export function readPlist(input) {
  const result = spawnSync(
    'python3',
    [
      '-c',
      `import sys, plistlib, json, datetime, base64
def encode(value):
    if isinstance(value, datetime.datetime): return value.isoformat() + 'Z'
    if isinstance(value, bytes): return base64.b64encode(value).decode()
    raise TypeError(type(value).__name__)
print(json.dumps(plistlib.loads(sys.stdin.buffer.read()), default=encode))`
    ],
    { input, encoding: 'utf8' }
  )
  if (result.error || result.status !== 0) {
    throw new Error('Could not decode the Apple property list with python3.')
  }
  return JSON.parse(result.stdout)
}

export function readProvisioningProfile(profilePath) {
  const result = spawnSync('security', ['cms', '-D', '-i', profilePath], {
    maxBuffer: 8 * 1024 * 1024
  })
  if (result.error || result.status !== 0) {
    throw new Error('security cms could not decode the supplied provisioning profile.')
  }
  return readPlist(result.stdout)
}

export function validateProvisioningProfile(profile, options) {
  const blockers = []
  const entitlements = profile.Entitlements ?? {}
  const teamId = profile.TeamIdentifier?.[0]
  const prefix = profile.ApplicationIdentifierPrefix?.[0]
  if (!/^[A-Z0-9]{10}$/.test(teamId ?? '')) {
    blockers.push('The profile needs a valid Apple Team ID.')
  }
  if (options.teamId && options.teamId !== teamId) {
    blockers.push('APPLE_TEAM_ID does not match the profile.')
  }
  if (!/^[a-fA-F0-9-]{36}$/.test(profile.UUID ?? '') || !profile.Name) {
    blockers.push('The profile is missing a valid UUID or name.')
  }
  if (entitlements['application-identifier'] !== `${prefix}.${options.bundleIdentifier}`) {
    blockers.push(
      'The profile must contain the exact AB bundle identifier; wildcard/upstream profiles are refused.'
    )
  }
  const expiry = Date.parse(profile.ExpirationDate)
  if (!Number.isFinite(expiry) || expiry <= (options.now ?? Date.now())) {
    blockers.push('The provisioning profile is expired or has no valid expiration date.')
  }
  if (profile.Platform && !profile.Platform.includes('iOS')) {
    blockers.push('The provisioning profile does not target iOS.')
  }
  if (profile.ProvisionsAllDevices) {
    blockers.push(
      'Enterprise provisioning is not supported by this personal distribution workflow.'
    )
  }
  const development = entitlements['get-task-allow'] === true
  const devices = profile.ProvisionedDevices ?? []
  if (options.method === 'development' && !development) {
    blockers.push('Development export requires a development profile.')
  }
  if (options.method !== 'development' && development) {
    blockers.push('Distribution export requires a distribution profile.')
  }
  if (options.method === 'app-store' && devices.length > 0) {
    blockers.push(
      'App Store export requires an App Store profile, without a registered-device list.'
    )
  }
  if (options.method !== 'app-store') {
    if (!options.deviceUdid) {
      blockers.push('Set AB_IOS_DEVICE_UDID to the intended iPhone UDID.')
    } else if (!devices.includes(options.deviceUdid)) {
      blockers.push('The intended iPhone is absent from the provisioning profile.')
    }
  }
  if (options.apsEnvironment !== 'disabled') {
    const expected = options.method === 'development' ? 'development' : 'production'
    if (options.apsEnvironment !== expected || entitlements['aps-environment'] !== expected) {
      blockers.push(
        'AB_IOS_APS_ENVIRONMENT, profile APNs entitlement, and export method must agree.'
      )
    }
  }
  return {
    blockers,
    teamId,
    profileUuid: profile.UUID,
    profileName: profile.Name,
    expiresAt: profile.ExpirationDate,
    registeredDeviceCount: devices.length
  }
}

export function exportOptionsPlist({
  method,
  teamId,
  bundleIdentifier,
  profileUuid,
  identityHash
}) {
  const escape = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>${escape(EXPORT_METHODS[method])}</string>
<key>destination</key><string>export</string>
<key>signingStyle</key><string>manual</string>
<key>teamID</key><string>${escape(teamId)}</string>
<key>signingCertificate</key><string>${escape(identityHash)}</string>
<key>provisioningProfiles</key><dict><key>${escape(bundleIdentifier)}</key><string>${escape(profileUuid)}</string></dict>
<key>manageAppVersionAndBuildNumber</key><false/>
<key>stripSwiftSymbols</key><true/>
<key>thinning</key><string>&lt;none&gt;</string>
</dict></plist>
`
}
