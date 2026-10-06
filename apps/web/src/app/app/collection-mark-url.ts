import type { Collection } from '@stepler/contracts';

/**
 * The picture of a collection's mark on the admin screens: its «Картинка колекції» thumbnail once
 * the worker made it, else `null` (the initials). Never the guest page's cover (plan Task 24):
 * that one is for guests.
 */
export function collectionMarkUrl(collection: Pick<Collection, 'image'>): string | null {
  const { image } = collection;
  return image !== null && image.status === 'READY' ? image.thumbnailUrl : null;
}
