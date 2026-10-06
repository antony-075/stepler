import type { CSSProperties } from 'react';
import { cn } from '../lib/utils';

type SegmentThumbProps = {
  /** How many equal segments share the track. */
  count: number;
  orientation?: 'horizontal' | 'vertical';
  /** The track's padding, which the thumb keeps clear of (CSS length). */
  inset?: string;
  className?: string;
};

/**
 * The sliding highlight of a segmented control or a vertical tab list (DESIGN-SYSTEM.md §0.6).
 * CSS only: the segments are equal, so the thumb is one segment wide (or tall) and moves by
 * `index × 100%` of itself; the index comes from which sibling is active (`:has()` rules in
 * styles/globals.css, up to 8 segments), so it follows controlled and uncontrolled groups alike,
 * nothing is measured and no script runs. Hidden until an item is active. Transform only, 160ms
 * with the system easing; still under reduced motion. Decorative: the state is the items' own
 * `aria-checked` / `aria-selected`. Render it as the FIRST child of a `relative isolate` track
 * whose items are its next siblings and sit above it (`relative z-1`).
 */
function SegmentThumb({
  count,
  orientation = 'horizontal',
  inset = '2px',
  className,
}: SegmentThumbProps) {
  if (count <= 0) return null;
  const style = {
    '--thumb-count': count,
    '--thumb-inset': inset,
  } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      data-slot="segment-thumb"
      style={style}
      className={cn(
        'pointer-events-none absolute z-0 rounded-[5px] bg-thumb shadow-[0_0_0_1px_var(--thumb-edge),0_1px_2px_rgb(24_24_27/0.06)]',
        'transition-transform duration-(--duration-base) ease-out motion-reduce:transition-none',
        orientation === 'horizontal'
          ? 'top-(--thumb-inset) bottom-(--thumb-inset) left-(--thumb-inset) w-[calc((100%-2*var(--thumb-inset))/var(--thumb-count))] translate-x-[calc(var(--thumb-index)*100%)]'
          : 'top-(--thumb-inset) right-(--thumb-inset) left-(--thumb-inset) h-[calc((100%-2*var(--thumb-inset))/var(--thumb-count))] translate-y-[calc(var(--thumb-index)*100%)]',
        className,
      )}
    />
  );
}

export { SegmentThumb, type SegmentThumbProps };
