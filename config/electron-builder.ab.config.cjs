const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const base = require('./electron-builder.config.cjs')
const { resolveDistributionIdentity } = require('./distribution-identity.cjs')

const identity = resolveDistributionIdentity('ab-brainmaster')

module.exports = {
  ...base,
  appId: identity.appId,
  productName: identity.productName,
  protocols: [],
  publish: null,
  extraMetadata: { name: identity.id },
  directories: { ...base.directories, output: 'dist/ab-brainmaster' },
  linux: {
    ...base.linux,
    icon: 'resources/build/ab-brainmaster.png',
    executableName: identity.executableName,
    maintainer: 'oalexandrebelo',
    target: ['dir'],
    desktop: { entry: { StartupWMClass: identity.id } }
  },
  beforePack: (context) => {
    if (
      context.electronPlatformName !== 'linux' ||
      context.targets.some((target) => target.name !== 'dir')
    ) {
      throw new Error('AB packaging currently supports Linux directory builds only.')
    }
    const marker = JSON.parse(
      readFileSync(join(__dirname, '../out/main/distribution.json'), 'utf8')
    )
    if (JSON.stringify(marker) !== JSON.stringify(identity)) {
      throw new Error('Build the AB host before packaging; the compiled identity does not match.')
    }
    return base.beforePack(context)
  }
}
