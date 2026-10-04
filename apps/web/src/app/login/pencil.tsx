import { cn } from '@stepler/ui/lib/utils';

// A hand-drawn arrow: a slightly uneven curve plus an open head in one path, so a single dash
// draws the shaft and then the head. From the lower left up to the right.
const ARROW = { viewBox: '0 0 48 56', d: 'M7 52 C4 30 17 12 41 7 M31 2.5 L42 6.5 L34.5 15' };

/**
 * The landing's one wax-pencil arrow (DESIGN-SYSTEM.md §5.13, §8: the pencil is rare; here it
 * is the page's only accent), from the handwritten note to the phone. It draws once on load
 * (`delay`); under reduced motion it is simply there. Decorative.
 */
export function PencilArrow({
  delay,
  className,
}: {
  /** When the arrow starts drawing, in ms after load. */
  delay: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox={ARROW.viewBox}
      className={cn('pointer-events-none overflow-visible', className)}
    >
      <path
        data-pencil-mark="arrow"
        d={ARROW.d}
        pathLength={1}
        fill="none"
        stroke="var(--pencil)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
        style={{ animationDelay: `${delay}ms` }}
        className="[stroke-dasharray:1] motion-safe:animate-[pencil-draw_480ms_var(--ease-out)_both]"
      />
    </svg>
  );
}
