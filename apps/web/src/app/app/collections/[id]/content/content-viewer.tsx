'use client';

import type { AdminContentItem } from '@stepler/contracts';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { FrameViewer } from '@stepler/ui/components/frame-viewer';
import { useToast } from '@stepler/ui/components/toast';
import { focusRing } from '@stepler/ui/lib/focus';
import { formatFrameNumber } from '@stepler/ui/lib/frame-number';
import { cn } from '@stepler/ui/lib/utils';
import { ImageIcon, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * One frame full screen for the collection's owner (DESIGN-SYSTEM.md §5.12, [O3]): the number,
 * time and contributor's name on top, «Видалити» beside «Закрити», ←/→ across the frames already
 * loaded in the grid. A wish is shown whole at 20px (it scrolls in its own focusable box); files
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
  const time = format.dateTime(created, { hour: '2-digit', minute: '2-digit' });
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
            <span className="text-muted-foreground">{time}</span>
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
          <div
            // A long wish scrolls in its own box; keyboard users scroll it too.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            className={cn(
              'max-h-full w-full max-w-[60ch] overflow-y-auto rounded-control px-2 text-xl leading-normal whitespace-pre-line [overflow-wrap:anywhere]',
              focusRing,
            )}
          >
            {item.text}
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
