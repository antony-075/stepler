import type {
  AdminContentDetail,
  AdminContentItem,
  GuestContentDetail,
  GuestContentItem,
} from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import type { ContentItem as ContentItemRow } from '../generated/prisma/client.js';
import { canDeleteItem, isOwnItem } from '../guest-access/guest-policy.js';
import { type MediaRow, mediaOf } from './media-urls.js';

/** A content row, with its stored files when the query brought them (`WITH_MEDIA`). */
export type ContentItemWithMedia = ContentItemRow & { mediaObjects?: readonly MediaRow[] };

/** Presigned media links; `null` until that derivative exists (media processing, PR D). */
export interface ContentMediaUrls {
  thumbnailUrl: string | null;
  previewUrl: string | null;
  posterUrl: string | null;
}

const NO_MEDIA: ContentMediaUrls = { thumbnailUrl: null, previewUrl: null, posterUrl: null };

/** The original's metadata (verified type, size, and dimensions once processed); texts have none. */
function fileOf(row: ContentItemWithMedia) {
  const original = mediaOf(row, 'ORIGINAL');
  return {
    mimeType: original?.mimeType ?? null,
    sizeBytes: original === undefined ? null : Number(original.sizeBytes),
    width: original?.width ?? null,
    height: original?.height ?? null,
    durationMs: original?.durationMs ?? null,
  };
}

/** The admin sees every number and the contributor's name. Explicit: never a Prisma row. */
export function toAdminContentItem(
  row: ContentItemWithMedia,
  urls: ContentMediaUrls = NO_MEDIA,
): AdminContentItem {
  return {
    id: row.id,
    frameNo: row.frameNo,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    contributorName: row.contributorName,
    originalFilename: row.originalFilename,
    ...fileOf(row),
    processingStatus: row.processingStatus,
    text: row.textBody,
    ...urls,
  };
}

/**
 * A guest sees a frame's number only on their own frames, and never anyone's name or session
 * [C16, ADR 0015].
 */
export function toGuestContentItem(
  row: ContentItemWithMedia,
  p: GuestPrincipal,
  urls: ContentMediaUrls = NO_MEDIA,
): GuestContentItem {
  const isOwn = isOwnItem(p, row);
  const file = fileOf(row);
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    isOwn,
    frameNo: isOwn ? row.frameNo : null,
    canDelete: canDeleteItem(p, row),
    // Other guests' metadata stays private (spec §8): a file name can carry a name or a place.
    originalFilename: isOwn ? row.originalFilename : null,
    // The type stays server-side [C16]; the size, like the name, only on own frames.
    sizeBytes: isOwn ? file.sizeBytes : null,
    width: file.width,
    height: file.height,
    durationMs: file.durationMs,
    processingStatus: row.processingStatus,
    text: row.textBody,
    ...urls,
  };
}

/** Links to the original file (view and download); `null` for texts. */
export interface OriginalUrls {
  originalUrl: string | null;
  downloadUrl: string | null;
}

const NO_ORIGINAL: OriginalUrls = { originalUrl: null, downloadUrl: null };

export function toAdminContentDetail(
  row: ContentItemWithMedia,
  urls: ContentMediaUrls = NO_MEDIA,
  original: OriginalUrls = NO_ORIGINAL,
): AdminContentDetail {
  return { ...toAdminContentItem(row, urls), ...original };
}

export function toGuestContentDetail(
  row: ContentItemWithMedia,
  p: GuestPrincipal,
  urls: ContentMediaUrls = NO_MEDIA,
  original: OriginalUrls = NO_ORIGINAL,
): GuestContentDetail {
  return { ...toGuestContentItem(row, p, urls), ...original };
}
