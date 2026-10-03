'use client';

import type { AdminContentItem } from '@stepler/contracts';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { FrameViewer } from '@stepler/ui/components/frame-viewer';
import { useToast } from '@stepler/ui/components/toast';
import { focusRing } from '@stepler/ui/lib/focus';
import { formatFrameNumber } from '@stepler/ui/lib/frame-number';
import { cn } from '@stepler/ui/lib/utils';
import { ImageIcon, Quote, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * One frame for the collection's owner (DESIGN-SYSTEM.md §5.12, [O3]): full screen on phones and
 * tablets, a large centred dialog from `lg`. The number, date and contributor's name on top,
 * «Видалити» beside «Закрити», ←/→ across the frames already loaded in the grid. A wish is a
 * centred card in large type (20–24px, at most 60 characters a line; a long one scrolls in its
 * own focusable box); files
 * show the preview placeholder until uploads and processing exist. Deleting asks first, in plain
 * words: guests stop seeing it and its number is never reused.
 */
export function ContentViewer({
  items,
  frameNo,
  onNavigate,
  onClose,
  onDelete,
}: {
  items: AdminContentItem[];
  frameNo: number | undefined;
  onNavigate: (frameNo: number) => void;
  onClose: () => void;
  /** Deletes the frame; the caller updates the grid and closes the viewer. */
  onDelete: (item: AdminContentItem) => Promise<void>;
}) {
  const t = useTranslations('content');
  const format = useFormatter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const index = frameNo === undefined ? -1 : items.findIndex((item) => item.frameNo === frameNo);
  const item = index === -1 ? undefined : items[index];
  const prev = index > 0 ? items[index - 1] : undefined;
  const next = index !== -1 && index < items.length - 1 ? items[index + 1] : undefined;

  if (item === undefined) return null;
  const created = new Date(item.createdAt);
  const when = format.dateTime(created, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const name = item.contributorName ?? t('noName');
  const number = formatFrameNumber(item.frameNo);

  return (
    <>
      <FrameViewer
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={
          <span className="flex min-w-0 items-baseline gap-3">
            <span translate="no" className="font-medium">
              {number}
            </span>
            <span className="shrink-0 text-muted-foreground">{when}</span>
            <span className="truncate font-sans [overflow-wrap:anywhere]">{name}</span>
          </span>
        }
        closeLabel={t('viewer.close')}
        prevLabel={t('viewer.prev')}
        nextLabel={t('viewer.next')}
        onPrev={prev === undefined ? undefined : () => onNavigate(prev.frameNo)}
        onNext={next === undefined ? undefined : () => onNavigate(next.frameNo)}
        returnFocus={() =>
          document.querySelector<HTMLElement>(`[data-frame="${item.frameNo}"] button`)
        }
        actions={
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-2 rounded-control px-3 text-[0.9375rem] font-semibold text-viewer-foreground transition-colors duration-(--duration-fast) hover:bg-[rgb(255_255_255/0.12)] motion-reduce:transition-none',
              focusRing,
            )}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">{t('viewer.delete')}</span>
          </button>
        }
        details={
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1">
            <dt className="text-muted-foreground">{t('viewer.added')}</dt>
            <dd className="tabular-nums">
              {format.dateTime(created, { dateStyle: 'long', timeStyle: 'short' })}
            </dd>
            <dt className="text-muted-foreground">{t('viewer.type')}</dt>
            <dd>{t(`kindTitle.${item.kind}`)}</dd>
            <dt className="text-muted-foreground">{t('viewer.from')}</dt>
            <dd className="[overflow-wrap:anywhere]">{name}</dd>
          </dl>
        }
      >
        {item.kind === 'TEXT' ? (
          // On phones the card keeps clear of the previous/next buttons at the stage's edges.
          <div className="flex size-full min-h-0 min-w-0 items-center justify-center max-sm:px-12">
            <div
              // A long wish scrolls in its own box; keyboard users scroll it too.
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
              className={cn(
                'max-h-full w-fit min-w-[min(100%,20rem)] max-w-[min(100%,60ch)] overflow-y-auto rounded-dialog border border-[rgb(255_255_255/0.1)] bg-[rgb(255_255_255/0.05)] px-6 py-7 sm:px-10 sm:py-9',
                focusRing,
              )}
            >
              <Quote aria-hidden="true" className="mb-4 size-6 text-muted-foreground" />
              <p className="text-xl leading-[1.55] text-pretty whitespace-pre-line [overflow-wrap:anywhere] sm:text-2xl sm:leading-[1.5]">
                {item.text}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid justify-items-center gap-2 text-muted-foreground">
            <ImageIcon aria-hidden="true" className="size-8" />
            <span>{t('pendingPreview')}</span>
          </div>
        )}
      </FrameViewer>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('delete.title', { frame: number })}
        description={t('delete.text')}
        confirmLabel={t('delete.confirm')}
        cancelLabel={t('delete.cancel')}
        pendingLabel={t('delete.pending')}
        errorMessage={t('delete.failed')}
        destructive
        onConfirm={async () => {
          await onDelete(item);
          toast({ variant: 'info', title: t('delete.done') });
        }}
      />
    </>
  );
}
