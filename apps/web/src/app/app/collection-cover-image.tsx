'use client';

// The collection's cover on the admin screens (plan Task 9; DESIGN-SYSTEM.md §5.10, §6.5).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - The cover takes the initials tile's slot at the same size, so cards and headers never move
//   when a cover is added, replaced or removed.
// - Small slots (`sm` 44px, `cover` 80/128px) load the 480px thumbnail; the `hero` loads the
//   1600px preview. A cover that is still `PENDING` or `FAILED` has no URL yet and shows the
//   initials: never a broken `<img>`.
// - The picture is decorative (`alt=""`): the title next to it names the collection.
// - A link that expired while the page stayed open asks for the collections again, once.

import type { Collection } from '@stepler/contracts';
import { CollectionCover, type CollectionCoverSize } from '@stepler/ui/components/collection-cover';
import { useQueryClient } from '@tanstack/react-query';
import { COLLECTIONS_KEY } from '@/api/collections';
import { MediaImg } from '@/media/media-img';
import { collectionInitials } from './collection-initials';
import { collectionTint } from './collection-tint';

/** The cover image URL for a slot of this size, or `null` while there is none to show. */
export function coverImageUrl(
  cover: Collection['cover'],
  size: CollectionCoverSize,
): string | null {
  if (cover === null || cover.status !== 'READY') return null;
  return size === 'hero' ? cover.previewUrl : cover.thumbnailUrl;
}

export function CollectionCoverImage({
  collection,
  size,
  className,
}: {
  collection: Pick<Collection, 'id' | 'title' | 'cover'>;
  size: CollectionCoverSize;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const url = coverImageUrl(collection.cover, size);
  const { cover } = collection;
  return (
    <CollectionCover
      tint={collectionTint(collection.id)}
      initials={collectionInitials(collection.title)}
      size={size}
      {...(className === undefined ? {} : { className })}
      {...(url === null
        ? {}
        : {
            image: (
              <MediaImg
                src={url}
                alt={DECORATIVE}
                decoding="async"
                loading={size === 'hero' ? 'eager' : 'lazy'}
                {...(cover?.width == null || cover.height == null
                  ? {}
                  : { width: cover.width, height: cover.height })}
                onExpired={() => void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY })}
              />
            ),
          })}
    />
  );
}

/** Decorative: the title beside or under it names the collection. */
const DECORATIVE = '';
