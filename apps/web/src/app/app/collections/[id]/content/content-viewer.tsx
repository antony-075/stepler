'use client';

import type { AdminContentItem } from '@stepler/contracts';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { FrameViewer } from '@stepler/ui/components/frame-viewer';
import { useToast } from '@stepler/ui/components/toast';
import { formatFrameNumber } from '@stepler/ui/lib/frame-number';
import { useQuery } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { getContent } from '@/api/content';
import { formatBytes, formatDuration } from '@/format/bytes';
import { contentDetailKey } from './use-pending-previews';
import { FileStage, TextStage, viewerButton } from '@/media/viewer-stage';

/** Media links are signed for at least an hour (spec §10.6); refetch well before. */
const DETAIL_STALE_MS = 30 * 60_000;

/**
 * One frame for the collection's owner (DESIGN-SYSTEM.md §5.12, [O3]): full screen on phones and
 * tablets, a large centred dialog from `lg`. The number, date and contributor's name on top,
 * «Видалити» beside «Закрити», ←/→ across the frames already loaded in the grid. A wish is a
 * centred card in large type (20–24px, at most 60 characters a line; a long one scrolls in its
 * own focusable box). Files load their detail for presigned links: a photo shows its 1600px
 * preview (upright, HEIC included; before it exists, the original where the browser can show
 * it), a video plays natively over its poster (`preload="metadata"`, with a fallback line when
 * the browser cannot play it), a document or a photo without a preview is a type tile with
 * «Завантажити» (always an attachment). The details add size, type, dimensions
 * and duration. Deleting asks first, in plain
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
  const [videoFailed, setVideoFailed] = useState<string | null>(null);
  const index = frameNo === undefined ? -1 : items.findIndex((item) => item.frameNo === frameNo);
  const item = index === -1 ? undefined : items[index];
  const prev = index > 0 ? items[index - 1] : undefined;
  const next = index !== -1 && index < items.length - 1 ? items[index + 1] : undefined;

  const isFile = item !== undefined && item.kind !== 'TEXT';
  const detail = useQuery({
    queryKey: contentDetailKey(item?.id ?? ''),
    queryFn: () => getContent(item?.id ?? ''),
    enabled: isFile,
    staleTime: DETAIL_STALE_MS,
  });

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
          <>
            {isFile && detail.data?.downloadUrl ? (
              <a href={detail.data.downloadUrl} className={viewerButton}>
                <Download aria-hidden="true" className="size-4" />
                <span className="max-sm:sr-only">{t('viewer.download')}</span>
              </a>
            ) : null}
            <button type="button" onClick={() => setConfirming(true)} className={viewerButton}>
              <Trash2 aria-hidden="true" className="size-4" />
              <span className="max-sm:sr-only">{t('viewer.delete')}</span>
            </button>
          </>
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
            {item.originalFilename === null ? null : (
              <>
                <dt className="text-muted-foreground">{t('viewer.file')}</dt>
                <dd className="[overflow-wrap:anywhere]">{item.originalFilename}</dd>
              </>
            )}
            {item.sizeBytes === null ? null : (
              <>
                <dt className="text-muted-foreground">{t('viewer.size')}</dt>
                <dd className="tabular-nums">{formatBytes(format.number, item.sizeBytes)}</dd>
              </>
            )}
            {item.width === null || item.height === null ? null : (
              <>
                <dt className="text-muted-foreground">{t('viewer.dimensions')}</dt>
                <dd className="tabular-nums">
                  {t('viewer.dimensionsValue', { width: item.width, height: item.height })}
                </dd>
              </>
            )}
            {item.durationMs === null ? null : (
              <>
                <dt className="text-muted-foreground">{t('viewer.duration')}</dt>
                <dd className="tabular-nums">{formatDuration(item.durationMs)}</dd>
              </>
            )}
            <dd className="col-span-2 pt-2 text-sm text-muted-foreground">
              {t('viewer.numberHint')}
            </dd>
          </dl>
        }
      >
        {item.kind === 'TEXT' ? (
          <TextStage body={item.text} />
        ) : (
          <FileStage
            item={item}
            photoAlt={t('viewer.photoAlt', { number: item.frameNo })}
            detail={detail.data}
            loading={detail.isPending}
            onExpired={() => void detail.refetch()}
            failed={detail.isError}
            videoFailed={videoFailed === item.id}
            onVideoError={() => setVideoFailed(item.id)}
          />
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
