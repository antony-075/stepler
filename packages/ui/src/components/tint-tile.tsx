import type { ReactNode } from 'react';
import { FRAME_TINT_CLASSES, type FrameTint } from '../lib/frame-tints';
import { cn } from '../lib/utils';

const SIZES = {
  /** 44px: a compact row (the archive). */
  sm: 'size-11 text-base',
  /** 56px on phones, 64px from `sm`: a collection's cover on the dashboard. */
  md: 'size-14 text-xl sm:size-16 sm:text-[1.375rem]',
  /** 72px: the mark of an empty state. */
  lg: 'size-18 text-2xl [&_svg]:size-8',
} as const;

type TintTileProps = {
  /** One of the curated tints (`FRAME_TINTS`); a collection's comes from its id. */
  tint: FrameTint;
  size?: keyof typeof SIZES;
  className?: string;
  /** Initials (1–2 letters) or one lucide icon; drawn in the tint's ink. */
  children: ReactNode;
};

/**
 * A calm square in one tint with a mark in its ink (DESIGN-SYSTEM.md §5.10, §5.16): a
 * collection's identity before it has content (its initials; the newest photo replaces the fill
 * in slice 7) and the mark of an empty state (an icon). Flat like a frame: 2px radius, a 1px
 * tint edge, no shadow. Decorative, so hidden from assistive technology; the caller names the
 * collection or the state in words. The ink passes 4.5:1 on its fill in both themes.
 */
function TintTile({ tint, size = 'md', className, children }: TintTileProps) {
  return (
    <span
      data-slot="tint-tile"
      data-tint={tint}
      aria-hidden="true"
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
