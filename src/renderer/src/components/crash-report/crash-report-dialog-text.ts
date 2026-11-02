import { translate } from '@/i18n/i18n'
import {
  isReactErrorBoundaryReport,
  type CrashReportRecord
} from '../../../../shared/crash-reporting'
import { getDistributionIdentity } from '../../../../shared/distribution-identity'

export function formatSummary(report: CrashReportRecord): string {
  if (isReactErrorBoundaryReport(report)) {
    const surface = typeof report.details.surface === 'string' ? report.details.surface : null
    return surface
      ? translate(
          'auto.components.crash.report.CrashReportDialogSurface.renderErrorIn',
          'React render error in {{surface}}',
          { surface }
        )
      : translate(
          'auto.components.crash.report.CrashReportDialogSurface.renderError',
          'React render error'
        )
  }
  return `${report.processType} ${report.reason}${
    report.exitCode === null ? '' : ` (exit ${report.exitCode})`
  }`
}

export function getDialogTitle(report: CrashReportRecord | null): string {
  if (!getDistributionIdentity().upstreamSupport) {
    return translate(
      'auto.components.crash.report.CrashReportDialogSurface.localTitle',
      'Local crash details'
    )
  }
  if (!report) {
    return translate(
      'auto.components.crash.report.CrashReportDialogSurface.reportTitle',
      'Report a crash'
    )
  }
  return report && isReactErrorBoundaryReport(report)
    ? translate(
        'auto.components.crash.report.CrashReportDialogSurface.uiErrorTitle',
        'Orca hit a recoverable UI error'
      )
    : translate(
        'auto.components.crash.report.CrashReportDialogSurface.closedTitle',
        'Orca closed unexpectedly'
      )
}

export function getDialogDescription(report: CrashReportRecord | null): string {
  if (!getDistributionIdentity().upstreamSupport) {
    return translate(
      'auto.components.crash.report.CrashReportDialogSurface.localDescription',
      'AB Brainmaster keeps this report local. Copy details for troubleshooting.'
    )
  }
  if (!report) {
    return translate(
      'auto.components.crash.report.CrashReportDialogSurface.reportDescription',
      'Send a privacy-safe crash report. Recent redacted diagnostic logs are included when available.'
    )
  }
  return report && isReactErrorBoundaryReport(report)
    ? translate(
        'auto.components.crash.report.CrashReportDialogSurface.uiErrorDescription',
        'Send a privacy-safe diagnostic report to help us understand the failed UI surface.'
      )
    : translate(
        'auto.components.crash.report.CrashReportDialogSurface.closedDescription',
        'Send a privacy-safe diagnostic report to help us understand what happened.'
      )
}

export function getNotesPlaceholder(report: CrashReportRecord | null): string {
  if (!report || !getDistributionIdentity().upstreamSupport) {
    return translate(
      'auto.components.crash.report.CrashReportDialogSurface.reportNotesPlaceholder',
      'Optional: what happened?'
    )
  }
  return report && isReactErrorBoundaryReport(report)
    ? translate(
        'auto.components.crash.report.CrashReportDialogSurface.uiErrorNotesPlaceholder',
        'Optional: what were you doing before this UI error?'
      )
    : translate(
        'auto.components.crash.report.CrashReportDialogSurface.closedNotesPlaceholder',
        'Optional: what were you doing before Orca closed?'
      )
}
