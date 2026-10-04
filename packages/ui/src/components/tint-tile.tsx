import type { HTMLAttributes, ReactNode } from 'react';
import { FRAME_TINT_CLASSES, type FrameTint } from '../lib/frame-tints';
import { cn } from '../lib/utils';

const SIZES = {
  /** 44px: a compact row (the archive). */
  sm: 'size-11 text-base',
  /** 56px on phones, 64px from `sm`: a collection's cover on the dashboard. */
  md: 'size-14 text-xl sm:size-16 sm:text-[1.375rem]',
  /** 72px: the mark of an empty state. */
  lg: 'size-18 text-2xl [&_svg]:size-8',
  /** 80px on phones, 128px from `sm`: a collection's cover in a dashboard card. */
  cover: 'size-20 text-2xl sm:size-32 sm:text-[2.25rem]',
  /** The full width of its container, square: the collection's summary card in settings. */
  fill: 'aspect-square w-full text-5xl',
} as const;

type TintTileProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'className'> & {
  /** One of the curated tints (`FRAME_TINTS`); a collection's comes from its id. */
  tint: FrameTint;
  size?: keyof typeof SIZES;
  className?: string;
  /** Initials (1–2 letters) or one lucide icon; drawn in the tint's ink. */
  children: ReactNode;
};

/**
 * A calm square in one tint with a mark in its ink (DESIGN-SYSTEM.md §5.10, §5.16): a
 * collection's identity while it has no cover (its initials; `CollectionCover` is the slot that
 * shows the admin's cover picture instead, at the same size) and the mark of an empty state (an
 * icon). Other attributes (`data-*`) pass through to the tile. Flat like a frame: 2px radius, a 1px
 * tint edge, no shadow. Decorative, so hidden from assistive technology; the caller names the
 * collection or the state in words. The ink passes 4.5:1 on its fill in both themes.
 */
function TintTile({ tint, size = 'md', className, children, ...props }: TintTileProps) {
  return (
    <span
      data-slot="tint-tile"
      data-tint={tint}
      aria-hidden="true"
      {...props}
      className={cn(
        "grid shrink-0 place-items-center rounded-frame border leading-none font-semibold select-none [font-variation-settings:'SHRP'_60]",
        FRAME_TINT_CLASSES[tint],
        SIZES[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

export { TintTile, type TintTileProps };
