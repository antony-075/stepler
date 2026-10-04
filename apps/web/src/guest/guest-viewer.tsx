'use client';

// The guest's viewer (DESIGN-SYSTEM.md §5.12; [C15], [C16]).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - The same `FrameViewer` stage as the admin's: full screen on phones and tablets, a centred
//   dialog from `lg`, ←/→ and swipe across the frames of the list it was opened from.
// - Privacy first: another guest's frame is only its time and kind. No number, no name, no file
//   name or size (the API does not send them). The guest's own frame shows its `#012`, file
//   name and size, like the admin's details.
// - «Завантажити» on every file; «Видалити» only on the guest's own frame and only when the link
//   allows it, behind a plain confirm («Видалити кадр #012?»), never typed.
import type { GuestContentItem } from '@stepler/contracts';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { FrameViewer } from '@stepler/ui/components/frame-viewer';
import { useToast } from '@stepler/ui/components/toast';
import { formatFrameNumber } from '@stepler/ui/lib/frame-number';
import { useQuery } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatBytes } from '@/format/bytes';
import { FileStage, TextStage, viewerButton } from '@/media/viewer-stage';
import { getGuestContent } from './api';

type Call = <T>(fn: (collectionId: string) => Promise<T>) => Promise<T>;

/** Media links are signed for at least an hour (spec §10.6); refetch well before. */
const DETAIL_STALE_MS = 30 * 60_000;

export const guestDetailKey = (collectionId: string, id: string) =>
  ['guest-content-detail', collectionId, id] as const;

/** Where focus goes back on close: the frame's button in the list it was opened from. */
const frameButton = (listId: string, id: string) =>
  document.querySelector<HTMLElement>(`[data-list="${listId}"] [data-item="${id}"] button`);

export function GuestViewer({
  collectionId,
  call,
  listId,
  items,
  openId,
  onNavigate,
  onClose,
  onDelete,
}: {
  collectionId: string;
  call: Call;
  /** The `data-list` of the grid the frames are in, so focus returns to the right copy. */
  listId: string;
  items: GuestContentItem[];
  openId: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
  /** Deletes an own frame; the caller refreshes the lists and closes the viewer. */
  onDelete: (item: GuestContentItem) => Promise<void>;
}) {
  const t = useTranslations('guest.viewer');
  const tContent = useTranslations('content');
  const format = useFormatter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [videoFailed, setVideoFailed] = useState<string | null>(null);
  const index = openId === null ? -1 : items.findIndex((item) => item.id === openId);
  const item = index === -1 ? undefined : items[index];
  const prev = index > 0 ? items[index - 1] : undefined;
  const next = index !== -1 && index < items.length - 1 ? items[index + 1] : undefined;

  const isFile = item !== undefined && item.kind !== 'TEXT';
  const detail = useQuery({
    queryKey: guestDetailKey(collectionId, item?.id ?? ''),
    queryFn: () => call((id) => getGuestContent(id, item?.id ?? '')),
    enabled: isFile,
    staleTime: DETAIL_STALE_MS,
    retry: false,
  });

  if (item === undefined) return null;
  const created = new Date(item.createdAt);
  const when = format.dateTime(created, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const number = item.frameNo === null ? null : formatFrameNumber(item.frameNo);
  const kind = tContent(`kindTitle.${item.kind}`);

  return (
    <>
      <FrameViewer
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={
          <span className="flex min-w-0 items-baseline gap-3">
            {number === null ? null : (
              <span translate="no" className="font-medium">
                {number}
              </span>
            )}
            <span className="shrink-0 text-muted-foreground">{when}</span>
            <span className="truncate font-sans">{kind}</span>
          </span>
        }
        closeLabel={t('close')}
        prevLabel={t('prev')}
        nextLabel={t('next')}
        onPrev={prev === undefined ? undefined : () => onNavigate(prev.id)}
        onNext={next === undefined ? undefined : () => onNavigate(next.id)}
        returnFocus={() => frameButton(listId, item.id)}
        actions={
          <>
            {isFile && detail.data?.downloadUrl ? (
              <a href={detail.data.downloadUrl} className={viewerButton}>
                <Download aria-hidden="true" className="size-4" />
                <span className="max-sm:sr-only">{t('download')}</span>
              </a>
            ) : null}
            {item.canDelete ? (
              <button type="button" onClick={() => setConfirming(true)} className={viewerButton}>
                <Trash2 aria-hidden="true" className="size-4" />
                <span className="max-sm:sr-only">{t('delete')}</span>
              </button>
            ) : null}
          </>
        }
        details={
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1">
            <dt className="text-muted-foreground">{t('added')}</dt>
            <dd className="tabular-nums">
              {format.dateTime(created, { dateStyle: 'long', timeStyle: 'short' })}
            </dd>
            <dt className="text-muted-foreground">{t('type')}</dt>
            <dd>{kind}</dd>
            {item.originalFilename === null ? null : (
              <>
                <dt className="text-muted-foreground">{t('file')}</dt>
                <dd className="[overflow-wrap:anywhere]">{item.originalFilename}</dd>
              </>
            )}
            {item.sizeBytes === null ? null : (
              <>
                <dt className="text-muted-foreground">{t('size')}</dt>
                <dd className="tabular-nums">{formatBytes(format.number, item.sizeBytes)}</dd>
              </>
            )}
            {item.isOwn ? null : (
              <dd className="col-span-2 pt-2 text-sm text-muted-foreground">{t('otherHint')}</dd>
            )}
          </dl>
        }
      >
        {item.kind === 'TEXT' ? (
          <TextStage body={item.text} />
        ) : (
          <FileStage
            item={item}
            detail={detail.data}
            loading={detail.isPending}
            onExpired={() => void detail.refetch()}
            failed={detail.isError}
            videoFailed={videoFailed === item.id}
            onVideoError={() => setVideoFailed(item.id)}
            photoAlt={number === null ? kind : t('photoAlt', { number })}
          />
        )}
      </FrameViewer>
      {item.canDelete && number !== null ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t('deleteTitle', { frame: number })}
          description={t('deleteText')}
          confirmLabel={t('deleteConfirm')}
          cancelLabel={t('deleteCancel')}
          pendingLabel={t('deletePending')}
          errorMessage={t('deleteFailed')}
          destructive
          onConfirm={async () => {
            await onDelete(item);
            toast({ variant: 'info', title: t('deleted') });
          }}
        />
      ) : null}
    </>
  );
}
