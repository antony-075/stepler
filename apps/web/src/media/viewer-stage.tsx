'use client';

import type { ContentKind, ProcessingStatus } from '@stepler/contracts';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { Download, FileText, ImageIcon, Quote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MediaImg } from './media-img';

/** Browsers outside Safari cannot show HEIC/HEIF: only their preview is shown. */
const NOT_SHOWN = new Set(['image/heic', 'image/heif']);

/** A 44px text-and-icon button on the viewer's dark bar (admin and guest viewers). */
export const viewerButton = cn(
  'inline-flex h-11 shrink-0 items-center gap-2 rounded-control px-3 text-[0.9375rem] font-semibold text-viewer-foreground transition-colors duration-(--duration-fast) hover:bg-[rgb(255_255_255/0.12)] motion-reduce:transition-none',
  focusRing,
);

/** `PDF`, `DOCX`…: the original name's extension, upper case; `''` without one. */
export function documentType(item: { originalFilename: string | null }): string {
  const name = item.originalFilename ?? '';
  return name.includes('.') ? (name.split('.').pop()?.toUpperCase() ?? '') : '';
}

/**
 * A wish on the viewer's stage: a centred card in large type (20–24px, at most 60 characters a
 * line); a long one scrolls in its own focusable box.
 */
export function TextStage({ body }: { body: string | null }) {
  return (
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
          {body}
        </p>
      </div>
    </div>
  );
}

/** What the stage needs of a frame: the admin's and the guest's items both fit. */
export interface StageItem {
  id: string;
  kind: ContentKind;
  originalFilename: string | null;
}

/** The detail's presigned links. `mimeType` only for the admin (guests never get it, [C16]). */
export interface StageDetail {
  previewUrl: string | null;
  originalUrl: string | null;
  downloadUrl: string | null;
  posterUrl: string | null;
  processingStatus: ProcessingStatus;
  mimeType?: string | null;
}

/**
 * The file itself on the viewer's stage, or a tile that says what to do with it: a photo shows
 * its 1600px preview (upright, HEIC included; before it exists, the original where the type is
 * known and the browser can show it), a video plays natively over its poster
 * (`preload="metadata"`, with a fallback line when the browser cannot play it), a document or a
 * photo without a preview is a type tile with «Завантажити» (always an attachment).
 */
export function FileStage({
  item,
  detail,
  loading,
  failed,
  videoFailed,
  onVideoError,
  onExpired,
  photoAlt,
}: {
  item: StageItem;
  detail: StageDetail | undefined;
  loading: boolean;
  failed: boolean;
  videoFailed: boolean;
  onVideoError: () => void;
  /** A presigned link stopped working (the viewer stayed open past its window). */
  onExpired: () => void;
  photoAlt: string;
}) {
  const t = useTranslations('content');
  const type = documentType(item);
  const tile = (text: string, icon: 'image' | 'doc' = 'image') => (
    <div className="grid max-w-sm justify-items-center gap-3 px-6 text-center text-muted-foreground">
      {icon === 'doc' ? (
        <FileText aria-hidden="true" className="size-10" />
      ) : (
        <ImageIcon aria-hidden="true" className="size-8" />
      )}
      {icon === 'doc' && type !== '' ? (
        <span translate="no" className="type-data text-base text-viewer-foreground">
          {type}
        </span>
      ) : null}
      {icon === 'doc' && item.originalFilename !== null ? (
        <span className="[overflow-wrap:anywhere] text-viewer-foreground">
          {item.originalFilename}
        </span>
      ) : null}
      <span>{text}</span>
      {detail?.downloadUrl ? (
        <a
          href={detail.downloadUrl}
          className={cn(viewerButton, 'border border-[rgb(255_255_255/0.24)]')}
        >
          <Download aria-hidden="true" className="size-4" />
          {t('viewer.download')}
        </a>
      ) : null}
    </div>
  );

  if (loading) return tile(t('viewer.loadingMedia'));
  if (failed || detail === undefined) return tile(t('viewer.mediaFailed'));
  if (item.kind === 'DOCUMENT') return tile(t('viewer.documentOpen'), 'doc');
  if (item.kind === 'PHOTO') {
    // The preview, else the original while the worker is on it (once its location is stripped,
    // the API links it), when its type is known to be one browsers show (not HEIC).
    const mime = detail.mimeType ?? null;
    const shown =
      detail.previewUrl ??
      (detail.processingStatus === 'PENDING' && mime !== null && !NOT_SHOWN.has(mime)
        ? detail.originalUrl
        : null);
    if (shown === null) {
      return tile(
        t(detail.processingStatus === 'FAILED' ? 'previewUnavailable' : 'pendingPreview'),
      );
    }
    return (
      <MediaImg
        onExpired={onExpired}
        src={shown}
        alt={photoAlt}
        className="max-h-full max-w-full object-contain"
      />
    );
  }
  // No link to the original until the worker has stripped its location (ADR 0008 addendum): a
  // new video is `PENDING`, one from before waits `READY` for the backfill.
  if (detail.originalUrl === null) {
    return tile(t(detail.processingStatus === 'FAILED' ? 'viewer.mediaFailed' : 'pendingPreview'));
  }
  if (videoFailed) return tile(t('viewer.videoFallback'));
  return (
    // Guests' own recordings come without caption tracks; there is nothing to attach.
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      key={item.id}
      src={detail.originalUrl}
      {...(detail.posterUrl === null ? {} : { poster: detail.posterUrl })}
      controls
      preload="metadata"
      playsInline
      onError={onVideoError}
      className="max-h-full max-w-full"
    >
      {t('viewer.videoFallback')}
    </video>
  );
}
