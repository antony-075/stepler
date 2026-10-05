'use client';

import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { Spinner } from '@stepler/ui/components/spinner';
import { useToast } from '@stepler/ui/components/toast';
import { cn } from '@stepler/ui/lib/utils';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { GuestPageEditorApi } from './use-guest-page-editor';

/**
 * The editor's save bar (Appendix B), at the bottom of the panel: the status dot and line, then
 * «Скинути зміни» (outline, asks first) and «Зберегти» (ink, with a dot while there is something
 * guests do not see; the dot is said as «, є незбережені зміни»). Both wait (`aria-disabled`)
 * while nothing differs from what guests see. A failed save offers «Повторити»; a conflict is an
 * alert with «Показати останню версію». `size="touch"` gives the phone sheet its 48px buttons.
 */
export function SaveBar({
  editor,
  readOnly,
  size = 'default',
  className,
}: {
  editor: GuestPageEditorApi;
  readOnly: boolean;
  size?: 'default' | 'touch';
  className?: string;
}) {
  const t = useTranslations('guestPage');
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const { status, dirty } = editor;
  const idle = !dirty || readOnly;
  const touch = size === 'touch' ? 'h-12' : '';

  async function publish() {
    if (idle || publishing || status === 'conflict') return;
    setPublishing(true);
    try {
      await editor.save();
      toast({ variant: 'success', title: t('actions.published') });
    } catch (error) {
      // A conflict says so in the bar itself; anything else gets a toast.
      if (!(error instanceof Error && error.message === 'conflict')) {
        toast({ variant: 'error', title: t('actions.saveFailed') });
      }
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      data-slot="save-bar"
      data-status={status}
      className={cn('grid gap-3 border-t bg-background px-6 py-4', className)}
    >
      {status === 'conflict' ? (
        <Alert
          variant="warning"
          title={t('status.conflict')}
          action={
            <Button variant="outline" onClick={() => void editor.reloadLatest()}>
              {t('actions.showLatest')}
            </Button>
          }
        >
          {t('conflictText')}
        </Alert>
      ) : (
        <p
          role="status"
          className="flex min-h-6 items-center gap-2 text-sm"
          data-slot="save-status"
        >
          {status === 'saving' ? (
            <Spinner label={t('status.saving')} className="size-4 text-muted-foreground" />
          ) : (
            <span
              aria-hidden="true"
              className={cn('size-2 shrink-0 rounded-full', {
                'bg-success': status === 'saved',
                'bg-pencil': status === 'draft',
                'bg-destructive': status === 'error',
              })}
            />
          )}
          <span aria-hidden={status === 'saving' || undefined}>{t(`status.${status}`)}</span>
          {status === 'error' ? (
            <Button variant="ghost" size="sm" className="ml-auto text-link" onClick={editor.retry}>
              {t('actions.retry')}
            </Button>
          ) : null}
        </p>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
        <Button
          variant="outline"
          className={touch}
          aria-disabled={idle || undefined}
          onClick={() => {
            if (!idle) setConfirming(true);
          }}
        >
          <RotateCcw aria-hidden="true" />
          {t('actions.reset')}
        </Button>
        <Button
          className={cn('relative', touch)}
          aria-disabled={idle || publishing || status === 'conflict' || undefined}
          onClick={() => void publish()}
          data-slot="save-button"
        >
          {publishing ? <Spinner label={t('status.saving')} className="size-4" /> : null}
          {t('actions.save')}
          {dirty && !readOnly ? (
            <>
              <span className="sr-only">{t('actions.saveDirty')}</span>
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-background bg-pencil"
              />
            </>
          ) : null}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        destructive
        title={t('actions.resetTitle')}
        description={t('actions.resetText')}
        confirmLabel={t('actions.resetConfirm')}
        cancelLabel={t('actions.resetCancel')}
        pendingLabel={t('actions.resetPending')}
        errorMessage={t('actions.resetFailed')}
        onConfirm={async () => {
          await editor.reset();
          toast({ variant: 'info', title: t('actions.resetDone') });
        }}
      />
    </div>
  );
}
