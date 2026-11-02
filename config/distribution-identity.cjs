const identities = require('../src/shared/distribution-identities.json')

function resolveDistributionIdentity(value = process.env.ORCA_DISTRIBUTION ?? 'orca') {
  if (!Object.hasOwn(identities, value)) {
    throw new Error(`Unknown Orca distribution: ${value}`)
  }
  return Object.freeze({ ...identities[value] })
}

function distributionBuildDefines(identity, env = process.env) {
  const buildIdentity = env.ORCA_BUILD_IDENTITY
  const official = identity.upstreamTelemetry && ['stable', 'rc'].includes(buildIdentity)
  const optionalString = (value) =>
    identity.upstreamTelemetry && typeof value === 'string' && value.length > 0
      ? JSON.stringify(value)
      : 'null'
  return {
    ORCA_BUILD_IDENTITY: official ? JSON.stringify(buildIdentity) : 'null',
    ORCA_POSTHOG_WRITE_KEY: optionalString(env.ORCA_POSTHOG_WRITE_KEY),
    ORCA_DIAGNOSTICS_TOKEN_URL: optionalString(env.ORCA_DIAGNOSTICS_TOKEN_URL)
  }
}

module.exports = { resolveDistributionIdentity, distributionBuildDefines }
