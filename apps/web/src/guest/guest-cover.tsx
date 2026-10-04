'use client';

// The collection's cover as the hero of the guest page (plan Task 9, [A4], [A7]; DESIGN-SYSTEM.md
// §6.1). Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - Only when the admin set a cover and it is `READY` (the context never carries anything else):
//   the guest page had no initials tile before, so without a cover nothing new appears.
// - Above the title, the full width of the column: 16:10 on phones (at 360px it is about 205px
//   tall, so the title and the dock still share the first screen), 2:1 in the 720px tablet column
//   (360px, not 450), 4:3 in the 380/420px side panel from 1024px. The title keeps priority: the
//   picture never carries text.
// - The 1600px preview with `object-cover`, eager (it is the first thing seen), `width`/`height`
//   from the context so nothing shifts while it loads on `--muted`.
// - Decorative (`alt=""`): the h1 under it names the collection.
// - An expired link (a tab left open for hours) asks for the context again, once.

import type { GuestContext } from '@stepler/contracts';
import { CollectionCover } from '@stepler/ui/components/collection-cover';
import { MediaImg } from '@/media/media-img';
import { collectionInitials } from '@/app/app/collection-initials';
import { collectionTint } from '@/app/app/collection-tint';

export function GuestCover({
  collection,
  onExpired,
}: {
  collection: GuestContext['collection'];
  onExpired: () => void;
}) {
  const { cover } = collection;
  if (cover === null) return null;
  return (
    <CollectionCover
      tint={collectionTint(collection.id)}
      initials={collectionInitials(collection.title)}
      size="hero"
      className="mb-3 sm:aspect-[2/1] lg:mb-4 lg:aspect-[4/3]"
      image={
        <MediaImg
          src={cover.previewUrl}
          alt={DECORATIVE}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          width={cover.width}
          height={cover.height}
          onExpired={onExpired}
        />
      }
    />
  );
}

/** Decorative: the title beside or under it names the collection. */
const DECORATIVE = '';
