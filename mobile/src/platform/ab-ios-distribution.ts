import Constants from 'expo-constants'

const distribution = Constants.expoConfig?.extra?.abBrainmaster

export const isAbIosDistribution = distribution?.distribution === 'manual'
export const abIosRemotePushEnabled = !isAbIosDistribution || distribution?.pushEnabled === true
export const abIosApnsEnvironment: 'sandbox' | 'production' | null =
  distribution?.apsEnvironment === 'development'
    ? 'sandbox'
    : distribution?.apsEnvironment === 'production'
      ? 'production'
      : null
