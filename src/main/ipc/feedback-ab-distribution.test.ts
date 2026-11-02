import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AB_SUPPORT_LOCAL_MESSAGE } from '../../shared/distribution-identity'
import {
  resolveDiagnosticBuildTokenEndpoint,
  resolveDiagnosticTokenEndpoint
} from '../observability/diagnostic-upload-endpoint'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn<typeof fetch>() }))
vi.mock('electron', () => ({
  app: { getVersion: () => '1.4.214' },
  net: { fetch: fetchMock }
}))

import { submitFeedback } from './feedback'
import { FEEDBACK_API_URL, postFeedback, type FeedbackSubmitBody } from './feedback-request'

beforeEach(() => {
  vi.stubGlobal('ORCA_DISTRIBUTION_ID', 'ab-brainmaster')
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('refuses both feedback entry points before any upstream request', async () => {
  const body: FeedbackSubmitBody = {
    feedback: 'Local support report',
    submissionType: 'feedback',
    githubLogin: null,
    githubEmail: null,
    appVersion: '1.4.214',
    platform: process.platform,
    osRelease: 'test',
    arch: process.arch
  }
  await expect(submitFeedback({ ...body, submitAnonymously: true })).resolves.toMatchObject({
    ok: false,
    status: null,
    error: AB_SUPPORT_LOCAL_MESSAGE
  })
  await expect(postFeedback(FEEDBACK_API_URL, body)).rejects.toThrow(AB_SUPPORT_LOCAL_MESSAGE)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('ignores inherited and build diagnostic endpoints in the AB distribution', () => {
  vi.stubGlobal('ORCA_DIAGNOSTICS_TOKEN_URL', 'https://support.invalid/build')
  vi.stubGlobal('ORCA_BUILD_IDENTITY', 'stable')
  vi.stubEnv('ORCA_DIAGNOSTICS_TOKEN_URL', 'https://support.invalid/environment')
  expect(resolveDiagnosticBuildTokenEndpoint()).toBeNull()
  expect(resolveDiagnosticTokenEndpoint()).toBeNull()
})

it('preserves the explicit diagnostic endpoint for the upstream development target', () => {
  vi.stubGlobal('ORCA_DISTRIBUTION_ID', 'orca')
  vi.stubGlobal('ORCA_BUILD_IDENTITY', null)
  vi.stubGlobal('ORCA_DIAGNOSTICS_TOKEN_URL', null)
  vi.stubEnv('ORCA_DIAGNOSTICS_TOKEN_URL', 'https://support.invalid/environment')
  expect(resolveDiagnosticTokenEndpoint()).toBe('https://support.invalid/environment')
})
