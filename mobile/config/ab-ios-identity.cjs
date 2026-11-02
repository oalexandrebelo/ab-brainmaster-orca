const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_BUNDLE_ID = 'br.com.alexandrebelo.brainmaster.orca.mobile'
const MINIMUM_IOS = '15.1'

function resolveAbIosIdentity(env = process.env) {
  const bundleIdentifier = env.AB_IOS_BUNDLE_ID || DEFAULT_BUNDLE_ID
  if (!/^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+){2,}$/.test(bundleIdentifier)) {
    throw new Error('AB_IOS_BUNDLE_ID must be a reverse-DNS identifier without wildcards.')
  }
  if (bundleIdentifier.startsWith('com.stably.')) {
    throw new Error('The AB build must use its own bundle identifier.')
  }
  const apsEnvironment = env.AB_IOS_APS_ENVIRONMENT || 'disabled'
  if (!['disabled', 'development', 'production'].includes(apsEnvironment)) {
    throw new Error('AB_IOS_APS_ENVIRONMENT must be disabled, development, or production.')
  }
  const version = env.AB_IOS_VERSION || '0.1.0'
  const buildNumber = env.AB_IOS_BUILD_NUMBER || '1'
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[1-9]\d*$/.test(buildNumber)) {
    throw new Error(
      'AB_IOS_VERSION needs three numeric components; AB_IOS_BUILD_NUMBER is a positive integer.'
    )
  }
  return { bundleIdentifier, apsEnvironment, version, buildNumber, minimumIos: MINIMUM_IOS }
}

function applyAbIosIdentity(config, env = process.env) {
  const identity = resolveAbIosIdentity(env)
  const rename = (value) => value.replaceAll('Orca', 'AB BRAINMASTER')
  const locales = Object.fromEntries(
    Object.entries(config.locales ?? {}).map(([language, value]) => {
      const locale =
        typeof value === 'string'
          ? JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', value), 'utf8'))
          : value
      return [language, JSON.parse(rename(JSON.stringify(locale)))]
    })
  )
  return {
    ...config,
    name: 'AB BRAINMASTER ORCA',
    slug: 'ab-brainmaster-orca',
    scheme: 'ab-brainmaster-orca',
    version: identity.version,
    locales,
    ios: {
      ...config.ios,
      bundleIdentifier: identity.bundleIdentifier,
      buildNumber: identity.buildNumber,
      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleDisplayName: 'AB BRAINMASTER',
        NSLocalNetworkUsageDescription:
          'AB BRAINMASTER connects to your paired computer on your local network.',
        NSCameraUsageDescription:
          'Allow AB BRAINMASTER to scan the pairing QR code from your computer.',
        NSMicrophoneUsageDescription:
          'Allow AB BRAINMASTER to send voice dictation to your paired computer for transcription.',
        NSPhotoLibraryUsageDescription:
          'Allow AB BRAINMASTER to attach selected photos to a session on your paired computer.'
      }
    },
    extra: {
      ...config.extra,
      abBrainmaster: {
        ...identity,
        distribution: 'manual',
        pushEnabled: identity.apsEnvironment !== 'disabled'
      }
    },
    plugins: [
      ...(config.plugins ?? []).map((plugin) => {
        if (!Array.isArray(plugin)) {
          return plugin
        }
        const [name, options] = plugin
        if (name === 'expo-build-properties') {
          return [name, { ...options, ios: { ...options.ios, deploymentTarget: MINIMUM_IOS } }]
        }
        if (name === 'expo-camera' || name === 'expo-image-picker') {
          return [name, JSON.parse(rename(JSON.stringify(options)))]
        }
        return plugin
      }),
      ['./plugins/ab-ios-push-capability.js', { apsEnvironment: identity.apsEnvironment }]
    ]
  }
}

module.exports = { DEFAULT_BUNDLE_ID, MINIMUM_IOS, resolveAbIosIdentity, applyAbIosIdentity }
