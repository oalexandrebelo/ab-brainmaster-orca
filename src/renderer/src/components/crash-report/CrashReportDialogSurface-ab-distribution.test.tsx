// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CrashReportRecord } from '../../../../shared/crash-reporting'
import { CrashReportDialogSurface } from './CrashReportDialogSurface'

const mocks = vi.hoisted(() => ({
  upstreamSupport: false,
  viewer: vi.fn(),
  submit: vi.fn(),
  copy: vi.fn(),
  dismiss: vi.fn()
}))

vi.mock('../../../../shared/distribution-identity', () => ({
  getDistributionIdentity: () => ({
    upstreamSupport: mocks.upstreamSupport,
    productName: mocks.upstreamSupport ? 'Orca' : 'AB Brainmaster'
  })
}))

vi.mock('sonner', () => ({
  toast: { dismiss: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() }
}))

const report: CrashReportRecord = {
  id: 'crash-ab-local',
  createdAt: '2026-11-02T01:00:00.000Z',
  status: 'pending',
  source: 'renderer',
  processType: 'renderer',
  reason: 'crashed',
  exitCode: 5,
  appVersion: '1.4.214',
  platform: 'linux',
  osRelease: 'test',
  arch: 'x64',
  electronVersion: '43',
  chromeVersion: '150',
  details: {}
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.upstreamSupport = false
  mocks.viewer.mockResolvedValue({ login: 'upstream-user' })
  mocks.copy.mockResolvedValue({ ok: true })
  mocks.submit.mockResolvedValue({ ok: true, report: { ...report, status: 'sent' } })
  mocks.dismiss.mockResolvedValue({ ...report, status: 'dismissed' })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      gh: { viewer: mocks.viewer },
      crashReports: {
        submit: mocks.submit,
        copyLatestDiagnostics: mocks.copy,
        dismiss: mocks.dismiss
      }
    }
  })
})

afterEach(cleanup)

it('keeps AB crash notes local while copy and dismissal remain available', async () => {
  const onReportChange = vi.fn()
  const onOpenChange = vi.fn()
  await act(async () => {
    render(
      <CrashReportDialogSurface
        open
        report={report}
        loading={false}
        onReportChange={onReportChange}
        onOpenChange={onOpenChange}
      />
    )
  })
  expect(mocks.viewer).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Send Report' })).toBeNull()
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.getByText('Local crash details')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Local crash notes' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy Details' })))
  expect(mocks.copy).toHaveBeenCalledWith({ reportId: report.id, notes: 'Local crash notes' })
  await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!))
  expect(mocks.dismiss).toHaveBeenCalledWith({ reportId: report.id })
  expect(onReportChange).toHaveBeenCalledWith({ ...report, status: 'dismissed' })
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(mocks.submit).not.toHaveBeenCalled()
})

it('preserves the upstream report submission flow', async () => {
  mocks.upstreamSupport = true
  await act(async () => {
    render(
      <CrashReportDialogSurface
        open
        report={report}
        loading={false}
        onReportChange={vi.fn()}
        onOpenChange={vi.fn()}
      />
    )
  })
  expect(mocks.viewer).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('checkbox')).toBeTruthy()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send Report' })))
  expect(mocks.submit).toHaveBeenCalledWith({
    reportId: report.id,
    notes: '',
    includeDiagnosticLogs: true,
    submitAnonymously: false,
    githubLogin: 'upstream-user',
    githubEmail: null
  })
})
