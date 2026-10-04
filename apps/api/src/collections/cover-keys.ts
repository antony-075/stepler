// Cover objects live under the collection's prefix (spec §10.6), in a prefix of their own per
// cover id, so a replaced cover's objects can be purged as a whole while the live cover's stay.
// Keys are built from ids only: no user data, no file names.

export type CoverRole = 'original' | 'thumbnail' | 'preview';

/** Derived cover images are WebP, like photo derivatives. */
export const COVER_DERIVED_MIME = 'image/webp';

export const coverPrefix = (collectionId: string, coverId: string): string =>
  `collections/${collectionId}/cover/${coverId}/`;

/** `…/original` (the copied source, immutable), `…/thumbnail.webp`, `…/preview.webp`. */
export const coverKey = (collectionId: string, coverId: string, role: CoverRole): string =>
  `${coverPrefix(collectionId, coverId)}${role === 'original' ? 'original' : `${role}.webp`}`;
