import { afterAll, expect, it, vi } from 'vitest'
import type * as PostHogTransport from './posthog-transport'
import { makeFakeSettings, makeFakeStore, BASE_COMMON } from './client-test-harness'

const { createPostHogClient } = vi.hoisted(() => {
  Object.assign(globalThis, {
    ORCA_DISTRIBUTION_ID: 'ab-brainmaster',
    ORCA_BUILD_IDENTITY: 'stable',
    ORCA_POSTHOG_WRITE_KEY: 'upstream-test-key'
  })
  return { createPostHogClient: vi.fn() }
})
vi.mock('./posthog-transport', async (importOriginal) => ({
  ...(await importOriginal<typeof PostHogTransport>()),
  createPostHogClient
}))

afterAll(() => {
  for (const key of ['ORCA_DISTRIBUTION_ID', 'ORCA_BUILD_IDENTITY', 'ORCA_POSTHOG_WRITE_KEY']) {
    Reflect.deleteProperty(globalThis, key)
  }
})

it('never starts upstream telemetry for AB even with official credentials and opt-in', async () => {
  const client = await import('./client')
  const schedule = vi.fn()
  const store = makeFakeStore(
    makeFakeSettings({
      optedIn: true,
      installId: BASE_COMMON.install_id,
      existedBeforeTelemetryRelease: false
    })
  )
  client.initTelemetry(store, schedule)
  expect(client.isTelemetryEnabled()).toBe(false)
  expect(client.track('app_opened', {})).toBe(false)
  await client.setOptIn('settings', true)
  await client.shutdownTelemetry()
  expect(schedule).not.toHaveBeenCalled()
  expect(createPostHogClient).not.toHaveBeenCalled()
})
