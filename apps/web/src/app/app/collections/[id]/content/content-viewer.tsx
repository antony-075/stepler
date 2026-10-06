'use client';

import type { AdminContentItem } from '@stepler/contracts';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { FrameViewer } from '@stepler/ui/components/frame-viewer';
import { useToast } from '@stepler/ui/components/toast';
import { formatFrameNumber } from '@stepler/ui/lib/frame-number';
import { useQuery } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { getContent } from '@/api/content';
import { formatBytes, formatDuration } from '@/format/bytes';
import { contentDetailKey } from './use-pending-previews';
import { FileStage, TextStage, viewerButton } from '@/media/viewer-stage';
import { ModerationPanel } from './moderation-panel';

/** Media links are signed for at least an hour (spec §10.6); refetch well before. */
const DETAIL_STALE_MS = 30 * 60_000;

/**
 * One frame for the collection's owner (DESIGN-SYSTEM.md §5.12, [O3]): full screen on phones and
 * tablets, a large centred dialog from `lg`. The number, date and contributor's name on top,
 * «Завантажити» and «Видалити» beside «Закрити» (the cover is chosen in the guest-page editor
 * now, owner 2026-10-06), ←/→ across
 * the frames already loaded in the grid. A wish is a centred card in large type (20–24px, at
 * most 60 characters a line; a long one scrolls in its own focusable box). Files load their detail for presigned links: a photo shows its 1600px
 * preview (upright, HEIC included; before it exists, the original where the browser can show
 * it), a video plays natively over its poster (`preload="metadata"`, with a fallback line when
 * the browser cannot play it), a document or a photo without a preview is a type tile with
 * «Завантажити» (always an attachment). The details panel groups the frame (added, type, from)
 * and the file (name, size, dimensions, duration), each a small label over its value. Deleting asks first, in plain
 * words: guests stop seeing it and its number is never reused.
 */
export function ContentViewer({
  items,
  frameNo,
  onNavigate,
  onClose,
  onDelete,
  contactEmail,
  onModerationChanged,
}: {
  items: AdminContentItem[];
  frameNo: number | undefined;
  onNavigate: (frameNo: number) => void;
  onClose: () => void;
  /** Deletes the frame; the caller updates the grid and closes the viewer. */
  onDelete: (item: AdminContentItem) => Promise<void>;
  /** `LEGAL_CONTACT_EMAIL` for the operator-hide note (slice 9); `null` when unset. */
  contactEmail: string | null;
  /** After a hide, show or dismissal: the caller refreshes this frame, the lists and counts. */
  onModerationChanged: (item: AdminContentItem) => Promise<void>;
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
    // Texts too (slice 9): the detail carries the frame's open reports.
    enabled: item !== undefined,
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
          <div className="grid gap-5">
            <DetailGroup>
              <Detail label={t('viewer.added')}>
                <span className="block tabular-nums">
                  {format.dateTime(created, { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <span className="block text-[var(--viewer-muted)] tabular-nums">
                  {format.dateTime(created, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </Detail>
              <Detail label={t('viewer.type')}>{t(`kindTitle.${item.kind}`)}</Detail>
              <Detail label={t('viewer.from')}>{name}</Detail>
            </DetailGroup>
            {item.kind === 'TEXT' ? null : (
              <DetailGroup>
                {item.originalFilename === null ? null : (
                  <Detail label={t('viewer.file')}>{item.originalFilename}</Detail>
                )}
                {item.sizeBytes === null ? null : (
                  <Detail label={t('viewer.size')} data>
                    {formatBytes(format.number, item.sizeBytes)}
                  </Detail>
                )}
                {item.width === null || item.height === null ? null : (
                  <Detail label={t('viewer.dimensions')} data>
                    {t('viewer.dimensionsValue', { width: item.width, height: item.height })}
                  </Detail>
                )}
                {item.durationMs === null ? null : (
                  <Detail label={t('viewer.duration')} data>
                    {formatDuration(item.durationMs)}
                  </Detail>
                )}
              </DetailGroup>
            )}
            {detail.data === undefined ? null : (
              <ModerationPanel
                detail={detail.data}
                contactEmail={contactEmail}
                onChanged={() => onModerationChanged(item)}
              />
            )}
            <p className="border-t border-[rgb(255_255_255/0.12)] pt-4 text-sm leading-snug text-[var(--viewer-muted)]">
              {t('viewer.numberHint')}
            </p>
          </div>
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

/** A group of details: label over value pairs, 14px apart. */
function DetailGroup({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3.5">{children}</dl>;
}

/**
 * One detail: a small muted label over its value, which may wrap anywhere (a long file name) but
 * never squeezes beside its label. `data` sets the value in mono (sizes, dimensions, durations).
 */
function Detail({ label, data, children }: { label: string; data?: boolean; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-[var(--viewer-muted)]">{label}</dt>
      <dd
        className={
          data
            ? 'font-mono text-sm tabular-nums'
            : 'text-[0.9375rem] leading-snug [overflow-wrap:anywhere]'
        }
      >
        {children}
      </dd>
    </div>
  );
}
