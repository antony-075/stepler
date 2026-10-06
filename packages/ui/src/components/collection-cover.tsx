// CollectionCover: a collection's face wherever its initials showed (DESIGN-SYSTEM.md §5.10;
// owner decisions 2026-10-04, plan A4/A7).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - One slot, two fillings: the admin's cover picture, or the initials `TintTile` in the
//   collection's own tint. Both take exactly the same box, so a cover added or removed never
//   moves the card, the dialog header or the guest page around it.
// - The picture is shown as it is: `object-cover` edge to edge, no rotation, shadow or frame
//   (Direction C, ADR 0015). While it loads the box is `--muted`, never the tint, so a slow
//   image does not flash the initials' colour first.
// - Sizes: `sm` 44px and `cover` 80/128px are `TintTile`'s squares (same 2px radius); `hero` is
//   the full width of its column at 16:10 with the sheet radius (a phone keeps the title on the
//   first screen); a caller with a narrow column (the guest side panel) may make it 4:3.
// - Decorative: the caller names the collection in words, so the whole slot is `aria-hidden`.
import type { ReactNode } from 'react';
import type { FrameTint } from '../lib/frame-tints';
import { cn } from '../lib/utils';
import { TintTile } from './tint-tile';

const BOX = {
  /** 44px: a compact mark (the share dialog's header). */
  sm: 'size-11 rounded-frame',
  /** 80px on phones, 128px from `sm`: a dashboard card. */
  cover: 'size-20 rounded-frame sm:size-32',
  /** The full width of its column at 16:10: the guest page and the «Гостьова сторінка» tab. */
  hero: 'aspect-[16/10] w-full rounded-sheet',
  /**
   * The full width of a card at 16:9, from the 480px thumbnail (V1, 2026-10-06): the dashboard's
   * tiles and the collection's mini-nav. The caller sets the radius.
   */
  band: 'aspect-[16/9] w-full',
} as const;

const TILE_SIZE = { sm: 'sm', cover: 'cover', hero: 'fill', band: 'fill' } as const;

type CollectionCoverSize = keyof typeof BOX;

type CollectionCoverProps = {
  /** The collection's tint (from its id): the initials tile's colours. */
  tint: FrameTint;
  /** 1–2 letters from the title, shown while there is no picture. */
  initials: string;
  /** The caller's `<img alt="">` (e.g. `MediaImg`); it fills the box with `object-cover`. */
  image?: ReactNode;
  size: CollectionCoverSize;
  className?: string;
};

/**
 * The collection's cover picture, or its initials in its tint when it has none. Decorative
 * (`aria-hidden`); `data-state` says which one is shown.
 */
function CollectionCover({ tint, initials, image, size, className }: CollectionCoverProps) {
  if (image === undefined || image === null) {
    return (
      <TintTile
        tint={tint}
        size={TILE_SIZE[size]}
        data-slot="collection-cover"
        data-state="initials"
        className={cn(
          size === 'hero' && 'aspect-[16/10] rounded-sheet text-5xl sm:text-6xl',
          size === 'band' && 'aspect-[16/9] text-4xl',
          className,
        )}
      >
        <span translate="no">{initials}</span>
      </TintTile>
    );
  }
  return (
    <span
      data-slot="collection-cover"
      data-state="image"
      data-tint={tint}
      aria-hidden="true"
      className={cn(
        'relative block shrink-0 overflow-hidden bg-muted select-none',
        '[&_img]:block [&_img]:size-full [&_img]:object-cover',
        BOX[size],
        className,
      )}
    >
      {image}
    </span>
  );
}

export { CollectionCover, type CollectionCoverProps, type CollectionCoverSize };
