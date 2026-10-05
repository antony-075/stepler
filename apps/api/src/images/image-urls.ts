import { Injectable } from '@nestjs/common';
import type { AdminImage, GuestImage } from '@stepler/contracts';
import { MediaUrls } from '../content/media-urls.js';
import type { CollectionImage } from '../generated/prisma/client.js';
import { IMAGE_DERIVED_MIME, imageKey, RENDITIONS, type RenditionRole } from './image-keys.js';

/** What the image DTOs need of an image row (`IMAGE_SELECT`). */
export type ImageRow = Pick<
  CollectionImage,
  'id' | 'collectionId' | 'slot' | 'status' | 'width' | 'height'
>;

/** The `select` that brings an image row along with what references it. */
export const IMAGE_SELECT = {
  id: true,
  collectionId: true,
  slot: true,
  status: true,
  width: true,
  height: true,
} as const;

type Links = Record<'thumbnailUrl' | 'previewUrl' | 'largeUrl', string | null>;

const URL_FIELD: Record<RenditionRole, keyof Links> = {
  thumbnail: 'thumbnailUrl',
  preview: 'previewUrl',
  large: 'largeUrl',
};

/**
 * Presigned links to an image's renditions (never its original), signed per window like media
 * links. The owner sees the status; guests see an image only once it is `READY`, and never where
 * it came from. A slot without a rendition gets `null` for it (a cover has no `largeUrl`).
 */
@Injectable()
export class ImageUrls {
  constructor(private readonly media: MediaUrls) {}

  async forAdmin(image: ImageRow | null, now = new Date()): Promise<AdminImage | null> {
    if (image === null) return null;
    const links = await this.links(image, now);
    return {
      id: image.id,
      status: image.status,
      thumbnailUrl: links?.thumbnailUrl ?? null,
      previewUrl: links?.previewUrl ?? null,
      largeUrl: links?.largeUrl ?? null,
      width: image.width,
      height: image.height,
    };
  }

  /**
   * A guest page image for guests: `READY` only, with its thumbnail and preview (every guest
   * page slot has both) and `largeUrl` where the slot has one.
   */
  async forGuest(image: ImageRow | null, now = new Date()): Promise<GuestImage | null> {
    if (image === null || image.width === null || image.height === null) return null;
    const links = await this.links(image, now);
    if (links === null || links.thumbnailUrl === null || links.previewUrl === null) return null;
    return {
      thumbnailUrl: links.thumbnailUrl,
      previewUrl: links.previewUrl,
      largeUrl: links.largeUrl,
      width: image.width,
      height: image.height,
    };
  }

  /** The slot's rendition links, or `null` unless the worker has made them (`READY`). */
  private async links(image: ImageRow, now: Date): Promise<Links | null> {
    if (image.status !== 'READY') return null;
    const links: Links = { thumbnailUrl: null, previewUrl: null, largeUrl: null };
    await Promise.all(
      RENDITIONS[image.slot].map(async (role) => {
        links[URL_FIELD[role]] = await this.media.signInline(
          imageKey(image.collectionId, image.slot, image.id, role),
          IMAGE_DERIVED_MIME,
          now,
        );
      }),
    );
    return links;
  }
}
