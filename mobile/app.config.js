// Bare expo-notifications defaults to sandbox entitlements while non-dev push-token.ts reports production, silently losing TestFlight/App Store pushes.
// Derive APNs mode from release workflow env; Expo still supplies app.json, including Fastlane version/buildNumber rewrites, for everything else.
const { applyAbIosIdentity, resolveAbIosIdentity } = require('./config/ab-ios-identity.cjs')
const isAb = process.env.AB_IOS_VARIANT === 'brainmaster'
const APS_ENVIRONMENT = isAb
  ? resolveAbIosIdentity().apsEnvironment
  : process.env.ORCA_IOS_APS_ENVIRONMENT === 'production'
    ? 'production'
    : 'development'

module.exports = ({ config: baseConfig }) => {
  const config = isAb ? applyAbIosIdentity(baseConfig) : baseConfig
  const entitlements = { ...config.ios?.entitlements }
  if (APS_ENVIRONMENT === 'disabled') {
    delete entitlements['aps-environment']
  } else {
    entitlements['aps-environment'] = APS_ENVIRONMENT
  }
  return {
    ...config,
    // `expo run` installs a dev-client build cached for the current native fingerprint instead of
    // rebuilding; scripts/native-client.mjs populates the cache.
    buildCacheProvider: { plugin: './scripts/native-build-cache.cjs' },
    ios: {
      ...config.ios,
      entitlements
    },
    plugins: (config.plugins ?? [])
      .filter(
        (plugin) =>
          APS_ENVIRONMENT !== 'disabled' ||
          (Array.isArray(plugin) ? plugin[0] : plugin) !== 'expo-notifications'
      )
      .map((plugin) =>
        plugin === 'expo-notifications'
          ? [
              'expo-notifications',
              {
                enableBackgroundRemoteNotifications: true,
                mode: APS_ENVIRONMENT,
                icon: './assets/notification-icon.png'
              }
            ]
          : plugin
      )
  }
}
