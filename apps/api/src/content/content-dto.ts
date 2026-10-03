import type {
  AdminContentDetail,
  AdminContentItem,
  GuestContentDetail,
  GuestContentItem,
} from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import type { ContentItem as ContentItemRow } from '../generated/prisma/client.js';
import { canDeleteItem, isOwnItem } from '../guest-access/guest-policy.js';

/** Presigned media links; all `null` until files and previews exist (uploads, processing). */
export interface ContentMediaUrls {
  thumbnailUrl: string | null;
  previewUrl: string | null;
  posterUrl: string | null;
}

const NO_MEDIA: ContentMediaUrls = { thumbnailUrl: null, previewUrl: null, posterUrl: null };

/** File metadata arrives with uploads; texts have none. */
const NO_FILE = {
  sizeBytes: null,
  width: null,
  height: null,
  durationMs: null,
} as const;

/** The admin sees every number and the contributor's name. Explicit: never a Prisma row. */
export function toAdminContentItem(
  row: ContentItemRow,
  urls: ContentMediaUrls = NO_MEDIA,
): AdminContentItem {
  return {
    id: row.id,
    frameNo: row.frameNo,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    contributorName: row.contributorName,
    originalFilename: row.originalFilename,
    mimeType: null,
    ...NO_FILE,
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
  row: ContentItemRow,
  p: GuestPrincipal,
  urls: ContentMediaUrls = NO_MEDIA,
): GuestContentItem {
  const isOwn = isOwnItem(p, row);
  return {
    id: row.id,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    isOwn,
    frameNo: isOwn ? row.frameNo : null,
    canDelete: canDeleteItem(p, row),
    originalFilename: row.originalFilename,
    ...NO_FILE,
    processingStatus: row.processingStatus,
    text: row.textBody,
    ...urls,
  };
}

/** Links to the original file (view and download); `null` for texts and until uploads exist. */
export interface OriginalUrls {
  originalUrl: string | null;
  downloadUrl: string | null;
}

const NO_ORIGINAL: OriginalUrls = { originalUrl: null, downloadUrl: null };

export function toAdminContentDetail(
  row: ContentItemRow,
  urls: ContentMediaUrls = NO_MEDIA,
  original: OriginalUrls = NO_ORIGINAL,
): AdminContentDetail {
  return { ...toAdminContentItem(row, urls), ...original };
}

export function toGuestContentDetail(
  row: ContentItemRow,
  p: GuestPrincipal,
  urls: ContentMediaUrls = NO_MEDIA,
  original: OriginalUrls = NO_ORIGINAL,
): GuestContentDetail {
  return { ...toGuestContentItem(row, p, urls), ...original };
}
