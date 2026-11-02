import identities from './distribution-identities.json'

type DistributionIdentity = {
  id: string
  productName: string
  appId: string
  profileDirectory: string
  devProfileDirectory: string
  executableName: string
  protocol: string | null
  automaticUpdates: boolean
  manageOrcaCli: boolean
  upstreamTelemetry: boolean
  upstreamSupport: boolean
}

declare const ORCA_DISTRIBUTION_ID: 'orca' | 'ab-brainmaster' | undefined

export function getDistributionIdentity(): Readonly<DistributionIdentity> {
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- absent in plain Node and unit-test imports.
  const id = typeof ORCA_DISTRIBUTION_ID === 'undefined' ? 'orca' : ORCA_DISTRIBUTION_ID
  if (!id || !Object.hasOwn(identities, id)) {
    throw new Error(`Unknown Orca distribution: ${id}`)
  }
  return identities[id]
}

export const AB_UPDATE_DISABLED_MESSAGE =
  'Automatic updates are disabled for this AB Brainmaster development build. Install a reviewed AB build manually.'

export const AB_SUPPORT_LOCAL_MESSAGE =
  'AB Brainmaster keeps support reports local. Copy the report to retain or share it yourself.'
