const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins')

module.exports = function withAbIosPushCapability(config, { apsEnvironment }) {
  config = withEntitlementsPlist(config, (cfg) => {
    // Expo auto-loads the installed notifications plugin even when it is absent from plugins[].
    if (apsEnvironment === 'disabled') {
      delete cfg.modResults['aps-environment']
    } else {
      cfg.modResults['aps-environment'] = apsEnvironment
    }
    return cfg
  })
  return withInfoPlist(config, (cfg) => {
    if (apsEnvironment === 'disabled' && Array.isArray(cfg.modResults.UIBackgroundModes)) {
      cfg.modResults.UIBackgroundModes = cfg.modResults.UIBackgroundModes.filter(
        (mode) => mode !== 'remote-notification'
      )
    }
    return cfg
  })
}
