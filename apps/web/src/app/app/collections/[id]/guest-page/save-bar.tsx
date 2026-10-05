'use client';

import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { Spinner } from '@stepler/ui/components/spinner';
import { useToast } from '@stepler/ui/components/toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@stepler/ui/components/tooltip';
import { cn } from '@stepler/ui/lib/utils';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { HistoryButtons } from './history-buttons';
import type { GuestPageEditorApi } from './use-guest-page-editor';

/**
 * The editor's save bar (Appendix B): the status dot and line, then
 * «Скинути зміни» (outline, asks first) and «Зберегти» (ink, with a dot while there is something
 * guests do not see; the dot is said as «, є незбережені зміни»). Both wait (`aria-disabled`)
 * while nothing differs from what guests see. A failed save offers «Повторити»; a conflict is an
 * alert with «Показати останню версію». `size="touch"` gives the phone sheet its 48px buttons.
 * `layout="panel"` is the desktop settings panel's sticky top bar (owner remarks 71, 105): one
 * row in the panel's 300–600px, always in view while the settings scroll. The status is a dot and
 * one word («Чернетка», «Збережено») with the full sentence in a tooltip (and for screen readers);
 * «Скинути зміни» becomes an icon button with a tooltip in a narrow panel; «Зберегти» stays the
 * full primary with its unsaved dot. `stacked` is the phone sheet's foot.
 */
export function SaveBar({
  editor,
  readOnly,
  size = 'default',
  layout = 'stacked',
  className,
}: {
  editor: GuestPageEditorApi;
  readOnly: boolean;
  size?: 'default' | 'touch';
  layout?: 'stacked' | 'panel';
  className?: string;
}) {
  const header = layout === 'panel';
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

  const dot = (
    <span
      aria-hidden="true"
      className={cn('size-2 shrink-0 rounded-full', {
        'bg-success': status === 'saved',
        'bg-pencil': status === 'draft',
        'bg-destructive': status === 'error',
      })}
    />
  );

  return (
    <div
      data-slot="save-bar"
      data-status={status}
      data-layout={layout}
      className={cn(
        header
          ? 'sticky top-0 z-(--z-sticky) flex flex-wrap items-center gap-2 border-b bg-card py-2.5 pr-3 pl-4'
          : 'grid gap-3 border-t bg-background px-6 py-4',
        className,
      )}
    >
      {status === 'conflict' ? (
        <Alert
          className={cn({ 'basis-full': header })}
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
          className={cn('flex min-h-6 items-center gap-2 text-sm', {
            'min-w-0 flex-1 font-semibold': header,
          })}
          data-slot="save-status"
        >
          {status === 'saving' ? (
            <Spinner label={t('status.saving')} className="size-4 text-muted-foreground" />
          ) : null}
          {status === 'saving' || header ? null : dot}
          {header ? (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* The dot and the word say the state; the sentence is extra (and read in
                        full below). In the narrowest panel only the dot shows. */}
                    <span aria-hidden="true" className="inline-flex min-w-0 items-center gap-2">
                      {status === 'saving' ? null : dot}
                      <span className="truncate @max-[21rem]/settings:hidden">
                        {t(`statusShort.${status}`)}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t(`status.${status}`)}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="sr-only">{t(`status.${status}`)}</span>
            </>
          ) : (
            <span aria-hidden={status === 'saving' || undefined}>{t(`status.${status}`)}</span>
          )}
          {status === 'error' ? (
            <Button variant="ghost" size="sm" className="ml-auto text-link" onClick={editor.retry}>
              {t('actions.retry')}
            </Button>
          ) : null}
        </p>
      )}
      <div
        className={
          header
            ? 'ml-auto flex shrink-0 items-center gap-1'
            : 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2'
        }
      >
        {header ? <HistoryButtons editor={editor} /> : null}
        {header ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  aria-label={t('actions.reset')}
                  aria-disabled={idle || undefined}
                  className="@max-[26rem]/settings:size-9 @max-[26rem]/settings:px-0 pointer-coarse:@max-[26rem]/settings:size-11"
                  onClick={() => {
                    if (!idle) setConfirming(true);
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  {/* In a narrow panel only the icon shows (the tooltip and the name say it). */}
                  <span className="@max-[26rem]/settings:sr-only">{t('actions.reset')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('actions.reset')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
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
        )}
        <Button
          className={cn('relative', header && 'px-3', touch)}
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
