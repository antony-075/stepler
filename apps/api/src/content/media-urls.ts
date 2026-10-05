import { Inject, Injectable } from '@nestjs/common';
import { extensionOf, FILE_TYPES } from '@stepler/contracts';
import type { ContentKind, MediaRole, ProcessingStatus } from '../generated/prisma/client.js';
import { LimitsService } from '../limits/limits.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import type { ContentMediaUrls, OriginalUrls } from './content-dto.js';

// Presigned media links (spec §10.6). Each URL is signed as of the start of a fixed window and
// valid for two windows, so the same object gets the same URL for a whole window (the browser
// caches it) and a URL is good for at least one window after it was handed out. The response
// type is the verified MIME; images and video open inline, documents always download, and the
// explicit download link is an attachment for every kind. URLs are credentials: never logged.

/** The stored file fields a content row brings along. */
export interface MediaRow {
  role: MediaRole;
  storageKey: string;
  mimeType: string;
  sizeBytes: bigint;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

/** What `MediaUrls` needs of an item. */
export interface ItemWithMedia {
  kind: ContentKind;
  frameNo: number;
  originalFilename: string | null;
  processingStatus: ProcessingStatus;
  sanitizedAt: Date | null;
  mediaObjects?: readonly MediaRow[];
}

/** Who asks for an original: the collection's admin, or a guest. */
export type OriginalViewer = 'admin' | 'guest';

/**
 * Whether the original may be handed out (ADR 0008 addendum 2026-10-05). Documents always.
 * A photo or video only once the worker has removed its location metadata (`sanitizedAt`):
 * before that nobody gets it. One that could not be sanitised (`FAILED` without `sanitizedAt`)
 * stays the admin's: they own the collection and may need the file; guests never get it.
 */
export function canServeOriginal(item: ItemWithMedia, viewer: OriginalViewer): boolean {
  if (item.kind !== 'PHOTO' && item.kind !== 'VIDEO') return true;
  if (item.sanitizedAt !== null) return true;
  return viewer === 'admin' && item.processingStatus === 'FAILED';
}

/** The `include` that brings the media rows with content rows. */
export const WITH_MEDIA = {
  mediaObjects: {
    select: {
      role: true,
      storageKey: true,
      mimeType: true,
      sizeBytes: true,
      width: true,
      height: true,
      durationMs: true,
    },
  },
} as const;

export const mediaOf = (item: ItemWithMedia, role: MediaRole): MediaRow | undefined =>
  item.mediaObjects?.find((media) => media.role === role);

/** The start of the current signing window. */
export function windowStart(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

const MAX_FILENAME_CODE_POINTS = 150;
// Control characters and the characters that could break out of the header or a path.
// eslint-disable-next-line no-control-regex
const UNSAFE_FILENAME = /[\u0000-\u001f\u007f/\\"]/g;

/** RFC 5987 `value-chars`: percent-encode everything `encodeURIComponent` keeps but `'()*`. */
const encodeRfc5987 = (value: string): string =>
  encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * `attachment` with the original name as `filename*=UTF-8''…` (control characters, `/`, `\` and
 * `"` removed, at most 150 code points) and an ASCII `filename` fallback such as
 * `stepler-087.pdf`, for clients without RFC 6266 support.
 */
export function contentDispositionFor(filename: string | null, fallback: string): string {
  const safe = [...(filename ?? '').replace(UNSAFE_FILENAME, '').trim()]
    .slice(0, MAX_FILENAME_CODE_POINTS)
    .join('');
  const name = safe === '' || safe === '.' || safe === '..' ? fallback : safe;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

const EXT_BY_MIME = new Map<string, string>([
  ...FILE_TYPES.map((type): [string, string] => [type.canonicalMime, type.ext]),
  ['image/jpeg', 'jpg'],
]);

/**
 * `stepler-087.jpg`: the frame number and the extension of the verified type (a JPEG named
 * `.png` downloads as `.jpg`), else of the name, else `bin`.
 */
export function fallbackFilename(
  item: Pick<ItemWithMedia, 'frameNo' | 'originalFilename'>,
  mimeType: string,
): string {
  const fromName = extensionOf(item.originalFilename ?? '');
  const known = FILE_TYPES.some((type) => type.ext === fromName);
  const ext = EXT_BY_MIME.get(mimeType) ?? (known ? fromName : 'bin');
  return `stepler-${String(item.frameNo).padStart(3, '0')}.${ext}`;
}

/**
 * `stepler.jpg`: the download name of another guest's file. No frame number and nothing of the
 * original name (spec §8, ADR 0015, [C16]); only the verified type's extension, else `bin`.
 */
export function neutralFilename(mimeType: string): string {
  return `stepler.${EXT_BY_MIME.get(mimeType) ?? 'bin'}`;
}

@Injectable()
export class MediaUrls {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly limits: LimitsService,
  ) {}

  /** Thumbnail, preview and poster links of the derivatives that exist (PR D makes them). */
  async forItem(item: ItemWithMedia, now = new Date()): Promise<ContentMediaUrls> {
    const [thumbnailUrl, previewUrl, posterUrl] = await Promise.all(
      (['THUMBNAIL', 'PREVIEW', 'POSTER'] as const).map((role) => this.inline(item, role, now)),
    );
    return {
      thumbnailUrl: thumbnailUrl ?? null,
      previewUrl: previewUrl ?? null,
      posterUrl: posterUrl ?? null,
    };
  }

  /**
   * The original, to view (photos and videos only: a document is never opened inline from our
   * storage origin) and to download (an attachment for every file), only when `canServeOriginal`
   * allows it for `viewer`. The download carries the original name and frame number only for the
   * admin and the guest who added it (`own`, the default); for anyone else's file it is a neutral
   * `stepler.<ext>` (the disposition is part of the signed URL, which the guest can read).
   */
  async original(
    item: ItemWithMedia,
    { viewer, own = true, now = new Date() }: { viewer: OriginalViewer; own?: boolean; now?: Date },
  ): Promise<OriginalUrls> {
    const original = mediaOf(item, 'ORIGINAL');
    if (original === undefined || !canServeOriginal(item, viewer)) {
      return { originalUrl: null, downloadUrl: null };
    }
    const viewable = item.kind === 'PHOTO' || item.kind === 'VIDEO';
    const [originalUrl, downloadUrl] = await Promise.all([
      viewable ? this.inline(item, 'ORIGINAL', now) : Promise.resolve(null),
      this.sign(original.storageKey, now, {
        contentType: original.mimeType,
        contentDisposition: own
          ? contentDispositionFor(item.originalFilename, fallbackFilename(item, original.mimeType))
          : `attachment; filename="${neutralFilename(original.mimeType)}"`,
      }),
    ]);
    return { originalUrl: originalUrl ?? null, downloadUrl };
  }

  /** An inline link to any stored image (a cover's derivative), window-aligned like the rest. */
  signInline(key: string, mimeType: string, now = new Date()): Promise<string> {
    return this.sign(key, now, { contentType: mimeType, contentDisposition: 'inline' });
  }

  private async inline(item: ItemWithMedia, role: MediaRole, now: Date): Promise<string | null> {
    const media = mediaOf(item, role);
    if (media === undefined) return null;
    return this.signInline(media.storageKey, media.mimeType, now);
  }

  private sign(
    key: string,
    now: Date,
    response: { contentType: string; contentDisposition: string },
  ): Promise<string> {
    const window = this.limits.uploads().mediaUrlWindowSeconds;
    return this.storage.presignGet(key, {
      ...response,
      signingDate: windowStart(now, window),
      expiresInSeconds: 2 * window,
    });
  }
}
