// Admin image objects live under the collection's prefix (spec §10.6), in a prefix of their own
// per image id and slot, so a replaced image's objects can be purged as a whole while the live
// ones stay. Keys are built from ids only: no user data, no file names. A COVER image keeps the
// slice 8a cover keys (`…/cover/{id}/…`): covers were copied into images with the same ids.

import type { ImageSlot } from '../generated/prisma/client.js';

export type ImageSlotKey = ImageSlot;
export type RenditionRole = 'thumbnail' | 'preview' | 'large';
export type ImageRole = 'original' | RenditionRole;

/** Renditions are WebP, like photo derivatives. */
export const IMAGE_DERIVED_MIME = 'image/webp';

/**
 * What the worker makes per slot (plan Task 7): 480 px for the editor and the dashboard, 1600 px
 * for phones, 2400 px for a background on large screens. The collection image is a mark only.
 */
export const RENDITIONS: Record<ImageSlotKey, readonly RenditionRole[]> = {
  COVER: ['thumbnail', 'preview'],
  BACKGROUND: ['thumbnail', 'preview', 'large'],
  COLLECTION_IMAGE: ['thumbnail'],
};

const SEGMENT: Record<ImageSlotKey, string> = {
  COVER: 'cover',
  BACKGROUND: 'background',
  COLLECTION_IMAGE: 'collection-image',
};

export const imagePrefix = (collectionId: string, slot: ImageSlotKey, imageId: string): string =>
  `collections/${collectionId}/${SEGMENT[slot]}/${imageId}/`;

/** `…/original` (the copied source, immutable) or `…/{thumbnail|preview|large}.webp`. */
export const imageKey = (
  collectionId: string,
  slot: ImageSlotKey,
  imageId: string,
  role: ImageRole,
): string =>
  `${imagePrefix(collectionId, slot, imageId)}${role === 'original' ? 'original' : `${role}.webp`}`;
