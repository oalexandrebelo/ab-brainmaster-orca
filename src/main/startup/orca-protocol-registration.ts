import type { App } from 'electron'
import { getDistributionIdentity } from '../../shared/distribution-identity'

/**
 * Registers `orca://` with Windows, which NSIS installs leave unregistered; macOS reads it from
 * Info.plist and Linux packages from the desktop entry. Only packaged desktop launches register,
 * so dev, test and serve runs never take over the machine's handler.
 */
export function registerOrcaProtocolClient(
  app: Pick<App, 'isPackaged' | 'isDefaultProtocolClient' | 'setAsDefaultProtocolClient'>,
  options: { platform: NodeJS.Platform; desktopLaunch: boolean }
): boolean {
  const protocol = getDistributionIdentity().protocol
  if (!protocol || options.platform !== 'win32' || !app.isPackaged || !options.desktopLaunch) {
    return false
  }
  if (app.isDefaultProtocolClient(protocol)) {
    return false
  }
  try {
    return app.setAsDefaultProtocolClient(protocol)
  } catch (error) {
    console.warn('[protocol] Failed to register orca:// links:', error)
    return false
  }
}
