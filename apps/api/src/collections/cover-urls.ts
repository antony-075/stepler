import { Injectable } from '@nestjs/common';
import type { CollectionCover, GuestCover } from '@stepler/contracts';
import { MediaUrls } from '../content/media-urls.js';
import type { CollectionCover as CollectionCoverRow } from '../generated/prisma/client.js';
import { COVER_DERIVED_MIME, coverKey } from './cover-keys.js';

/** What the cover DTOs need of a cover row (`WITH_COVER`). */
export type CoverRow = Pick<
  CollectionCoverRow,
  'id' | 'collectionId' | 'status' | 'width' | 'height'
>;

/** The `select` that brings a cover row along with its collection. */
export const WITH_COVER = {
  cover: { select: { id: true, collectionId: true, status: true, width: true, height: true } },
} as const;

/**
 * Presigned links to a cover's derivatives (never its original), signed per window like media
 * links. The admin sees the status; guests see a cover only once it is `READY`, and never where
 * it came from.
 */
@Injectable()
export class CoverUrls {
  constructor(private readonly media: MediaUrls) {}

  async forAdmin(cover: CoverRow | null, now = new Date()): Promise<CollectionCover | null> {
    if (cover === null) return null;
    const urls = await this.urls(cover, now);
    return {
      status: cover.status,
      thumbnailUrl: urls?.thumbnailUrl ?? null,
      previewUrl: urls?.previewUrl ?? null,
      width: cover.width,
      height: cover.height,
    };
  }

  async forGuest(cover: CoverRow | null, now = new Date()): Promise<GuestCover | null> {
    if (cover === null) return null;
    const urls = await this.urls(cover, now);
    if (urls === null || cover.width === null || cover.height === null) return null;
    return { ...urls, width: cover.width, height: cover.height };
  }

  /** Both derivative links, or `null` unless the worker has made them (`READY`). */
  private async urls(
    cover: CoverRow,
    now: Date,
  ): Promise<{ thumbnailUrl: string; previewUrl: string } | null> {
    if (cover.status !== 'READY') return null;
    const sign = (role: 'thumbnail' | 'preview') =>
      this.media.signInline(coverKey(cover.collectionId, cover.id, role), COVER_DERIVED_MIME, now);
    const [thumbnailUrl, previewUrl] = await Promise.all([sign('thumbnail'), sign('preview')]);
    return { thumbnailUrl, previewUrl };
  }
}
