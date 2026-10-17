'use client';

// Uploads in their own sheet (owner remark 2026-10-16: the progress and the upload tiles were on
// the same screen as the actions and the frames). Design pass (frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design):
// - Picking files opens «Завантаження»: the bottom sheet on phones (thumb zone, safe area), a
//   centred 560px dialog from `sm`, in the template's tokens (`templateSurfaceProps`). Inside:
//   the batch as before (`UploadBatch`: the summary, the 2px line, the tiles, retries, the success
//   moment), «Не закривайте сторінку…» while files move, «Додати ще» and, once all is settled,
//   «Переглянути мої кадри» (switches to «Кадри»).
// - Closing it only folds it: uploads go on. Folded, a pill sits at the bottom centre over the
//   page («Завантажуємо 12 з 30 · Відкрити»; «Додано 30 з 30 · Переглянути»; «Не вдалося 2 ·
//   Відкрити»), 48px, in the template's tokens; once all is settled it can be put away (✕).
//   A spacer of its height ends the page, so the footer is never covered.
// - One polite live region stays in the batch summary; the pill only repeats it visually.

import type { GuestContext } from '@stepler/contracts';
import type { TemplateSurfaceProps } from '@stepler/templates/react';
import { Button } from '@stepler/ui/components/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@stepler/ui/components/sheet';
import { Spinner } from '@stepler/ui/components/spinner';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { hasUnsettled } from './upload/queue';
import type { UploadQueue } from './upload/use-upload-queue';
import { UploadBatch } from './uploader';

export function UploadSheet({
  open,
  onOpenChange,
  uploads,
  context,
  surface,
  onAddMore,
  onViewFrames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uploads: UploadQueue;
  context: GuestContext;
  surface: TemplateSurfaceProps;
  /** Opens the picker: must run inside the tap (iOS). */
  onAddMore: () => void;
  onViewFrames: () => void;
}) {
  const t = useTranslations('guest.upload');
  const busy = hasUnsettled(uploads.state);
  const anyAdded = uploads.summary.added > 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        {...surface}
        className={cn('flex flex-col sm:max-h-[calc(100dvh-4rem)]', surface.className)}
        data-slot="upload-sheet"
      >
        <SheetHeader closeLabel={t('sheet.fold')}>
          <SheetTitle>{t('sheet.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('sheet.description')}</SheetDescription>
        </SheetHeader>
        <SheetBody className="px-4 py-4 sm:px-6">
          <UploadBatch uploads={uploads} context={context} />
        </SheetBody>
        <div className="grid shrink-0 gap-3 border-t px-4 py-3 sm:px-6">
          {busy ? <p className="text-sm text-muted-foreground">{t('keepOpen')}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onAddMore} className="pointer-coarse:h-11">
              {t('sheet.addMore')}
            </Button>
            {!busy && anyAdded ? (
              <Button onClick={onViewFrames} className="pointer-coarse:h-11">
                {t('sheet.viewFrames')}
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The folded sheet: one line about the batch, a tap opens it again. */
export function UploadPill({
  uploads,
  surface,
  onOpen,
  onViewFrames,
  onDismiss,
}: {
  uploads: UploadQueue;
  surface: TemplateSurfaceProps;
  onOpen: () => void;
  onViewFrames: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations('guest.upload');
  const { summary } = uploads;
  const busy = hasUnsettled(uploads.state);
  const total = summary.total - summary.cancelled;
  const failed = !busy && summary.failed > 0;
  const done = !busy && !failed;
  const line = busy
    ? t('pill.busy', { added: summary.added, total })
    : failed
      ? t('pill.failed', { count: summary.failed })
      : t('pill.done', { added: summary.added, total });
  return (
    <div
      {...surface}
      data-slot="upload-pill"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
        surface.className,
      )}
    >
      <div className="pointer-events-auto flex min-h-12 max-w-full items-center gap-1 rounded-full border bg-card py-1 pr-1 pl-4 text-sm text-card-foreground shadow-lg">
        {busy ? (
          <Spinner label={line} className="size-4 text-muted-foreground" />
        ) : failed ? (
          <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
        ) : (
          <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
        )}
        <span className="min-w-0 truncate px-1 font-medium tabular-nums">{line}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={done ? onViewFrames : onOpen}
          className="shrink-0 rounded-full text-link pointer-coarse:h-11"
        >
          {done ? t('pill.view') : t('pill.open')}
        </Button>
        {busy ? null : (
          <button
            type="button"
            aria-label={t('pill.dismiss')}
            onClick={onDismiss}
            className={cn(
              'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-hover hover:text-foreground',
              focusRing,
            )}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** The pill's height at the end of the page, so it never covers the footer. */
export function UploadPillSpacer() {
  return <div aria-hidden="true" data-slot="upload-pill-spacer" className="h-20 shrink-0" />;
}
