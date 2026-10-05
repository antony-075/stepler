'use client';

// The collection's mark on the admin screens (plan Task 24; DESIGN-SYSTEM.md §5.10, §6.5).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - «Картинка колекції», the owner's own image, fills the initials tile's slot at the same size,
//   so cards and the share dialog never move when it is added, replaced or removed. The guest
//   page's cover is never used here: it belongs to the guest page (owner 2026-10-05).
// - Every size (`sm` 44px, `cover` 80/128px) loads the 480px thumbnail, the only rendition the
//   collection image has. One still `PENDING` or `FAILED` has no URL and shows the initials:
//   never a broken `<img>`.
// - The picture is decorative (`alt=""`): the title next to it names the collection.
// - A link that expired while the page stayed open asks for the collections again, once.

import type { Collection } from '@stepler/contracts';
import { CollectionCover } from '@stepler/ui/components/collection-cover';
import { useQueryClient } from '@tanstack/react-query';
import { COLLECTIONS_KEY } from '@/api/collections';
import { MediaImg } from '@/media/media-img';
import { collectionInitials } from './collection-initials';
import { collectionMarkUrl } from './collection-mark-url';
import { collectionTint } from './collection-tint';

export function CollectionMark({
  collection,
  size,
  className,
}: {
  collection: Pick<Collection, 'id' | 'title' | 'image'>;
  size: 'sm' | 'cover';
  className?: string;
}) {
  const queryClient = useQueryClient();
  const url = collectionMarkUrl(collection);
  const { image } = collection;
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
                loading="lazy"
                {...(image?.width == null || image.height == null
                  ? {}
                  : { width: image.width, height: image.height })}
                onExpired={() => void queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY })}
              />
            ),
          })}
    />
  );
}

/** Decorative: the title beside or under it names the collection. */
const DECORATIVE = '';
