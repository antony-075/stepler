import { cn } from '@stepler/ui/lib/utils';

// Three hand-drawn arrows of «Як це працює», each a slightly uneven curve plus an open head in
// one path, so a single dash draws the shaft and then the head.
const ARROWS = {
  /** From the first label down into the collection card. */
  down: { viewBox: '0 0 40 56', d: 'M33 4 C14 6 5 22 11 48 M4 40 L11.5 49.5 L18 39.5' },
  /** From the end of the second label back up into the QR card. */
  upLeft: { viewBox: '0 0 40 48', d: 'M29 44 C38 30 34 14 16 6 M24.5 2.5 L15.5 6 L21 14.5' },
  /** From the third label up to the phone. */
  up: { viewBox: '0 0 48 56', d: 'M7 52 C4 30 17 12 41 7 M31 2.5 L42 6.5 L34.5 15' },
} as const;

export type PencilArrowShape = keyof typeof ARROWS;

/**
 * A wax-pencil arrow joining a step label to its fragment (DESIGN-SYSTEM.md §5.13, §8: the
 * pencil is rare; here it is the landing's only accent). The three arrows draw one after
 * another once on load (`delay`); under reduced motion they are simply there. Decorative.
 */
export function PencilArrow({
  shape,
  delay,
  className,
}: {
  shape: PencilArrowShape;
  /** When this arrow starts drawing, in ms after load. */
  delay: number;
  className?: string;
}) {
  const arrow = ARROWS[shape];
  return (
    <svg
      aria-hidden="true"
      viewBox={arrow.viewBox}
      className={cn('pointer-events-none overflow-visible', className)}
    >
      <path
        data-pencil-mark="arrow"
        d={arrow.d}
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
