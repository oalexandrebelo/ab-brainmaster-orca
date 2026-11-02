import type { JSX } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useClipboardTextCopyFeedback } from '@/hooks/use-clipboard-text-copy-feedback'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export function AbLocalFeedbackDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  const feedback = useAppStore((state) => state.feedbackDraft.feedback)
  const setFeedbackDraft = useAppStore((state) => state.setFeedbackDraft)
  const { canCopy, copyText, status } = useClipboardTextCopyFeedback(feedback)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate('abBrainmaster.support.localReport', 'Local report')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'abBrainmaster.support.localDescription',
              'This draft stays on this computer. Copy the text to retain it or share it yourself.'
            )}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label={translate('abBrainmaster.support.reportText', 'Report text')}
          value={feedback}
          onChange={(event) => setFeedbackDraft({ feedback: event.target.value })}
          rows={7}
        />
        {status === 'failed' ? (
          <p role="alert" className="text-sm text-destructive">
            {translate(
              'abBrainmaster.support.copyFailed',
              'The text could not be copied. Your draft is still available.'
            )}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {translate('common.close', 'Close')}
          </Button>
          <Button disabled={!canCopy} onClick={() => void copyText()}>
            {status === 'copied'
              ? translate('common.copied', 'Copied')
              : translate('abBrainmaster.support.copyText', 'Copy text')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
