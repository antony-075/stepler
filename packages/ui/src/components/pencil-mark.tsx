import { cn } from '../lib/utils';

type PencilMarkVariant = 'circle' | 'underline' | 'cross';

// Five hand-drawn shapes per variant (DESIGN-SYSTEM.md §5.13), so marks on neighbouring frames
// do not look stamped. Each is one path: an uneven loop that overshoots its start, a wavering
// stroke, or two strokes of a cross.
// `strokeWidth` is in viewBox units, chosen so the stroke is about 2.5px (3px for the cross) at the
// size each variant is drawn for: a circle around a frame label (about 46×22), an underline under
// a number or tab (about 44×6), a cross over a frame's media (about 100×100). The stroke scales
// with the box: `vector-effect: non-scaling-stroke` would break the dash animation.
const SHAPES: Record<
  PencilMarkVariant,
  { viewBox: string; strokeWidth: number; paths: readonly string[] }
> = {
  circle: {
    viewBox: '0 0 100 48',
    strokeWidth: 5,
    paths: [
      'M58 5 C30 2 6 10 5 24 C4 40 34 46 60 43 C84 40 97 31 95 19 C93 8 72 3 46 6',
      'M44 4 C20 5 3 15 6 28 C9 41 36 46 62 42 C86 38 98 27 94 16 C90 6 66 2 38 8',
      'M62 6 C36 1 8 9 4 22 C1 37 28 46 55 44 C82 42 99 32 96 20 C93 9 74 4 52 4',
      'M50 3 C24 4 4 13 5 26 C6 40 32 47 58 44 C83 41 96 30 95 18 C94 7 70 2 40 7',
      'M55 6 C27 3 5 12 6 25 C7 39 35 45 61 42 C85 39 96 29 93 17 C90 7 69 4 48 5',
    ],
  },
  underline: {
    viewBox: '0 0 100 12',
    strokeWidth: 5,
    paths: [
      'M2 7 C20 4 42 9 62 6 C76 4 88 5 98 6',
      'M3 6 C18 8 38 4 58 6 C74 8 88 5 97 7',
      'M2 8 C22 5 40 7 60 5 C78 3 90 7 98 5',
      'M3 5 C21 7 44 6 63 7 C79 8 90 4 97 6',
      'M2 6 C17 5 37 8 56 6 C73 4 87 8 98 6',
    ],
  },
  cross: {
    viewBox: '0 0 100 100',
    strokeWidth: 3,
    paths: [
      'M18 16 C38 38 60 62 84 86 M82 14 C60 36 40 60 16 84',
      'M16 20 C40 40 62 60 86 82 M84 18 C62 38 38 62 18 86',
      'M20 14 C40 36 58 60 82 84 M80 16 C58 40 42 58 14 82',
      'M14 18 C36 40 60 58 86 84 M86 16 C62 40 40 60 20 86',
      'M18 18 C40 38 60 62 82 82 M82 18 C60 40 40 62 18 82',
    ],
  },
};

type PencilMarkProps = {
  variant: PencilMarkVariant;
  /** Picks one of five shapes (e.g. the frame number), so the same frame keeps its mark. */
  seed: number;
  /** Draw the stroke once when it appears (default); `false` shows it whole. */
  animate?: boolean;
  className?: string;
};

/**
 * A wax-pencil stroke (DESIGN-SYSTEM.md §5.13): `circle` around a number or frame, `underline`
 * under an active tab, a "new" frame or a total, `cross` over a failed frame (always
 * destructive). Draws once in 180ms (`pencil-draw`); whole under reduced motion. Always
 * decorative: the text or attribute next to it carries the meaning. The caller sizes and places
 * it; the shape stretches to the box.
 */
function PencilMark({ variant, seed, animate = true, className }: PencilMarkProps) {
  const shape = SHAPES[variant];
  const d = shape.paths[Math.abs(Math.trunc(seed)) % shape.paths.length];
  return (
    <svg
      data-slot="pencil-mark"
      data-variant={variant}
      aria-hidden="true"
      focusable="false"
      viewBox={shape.viewBox}
      preserveAspectRatio="none"
      className={cn(
        'pointer-events-none overflow-visible',
        variant === 'cross' ? 'text-destructive' : 'text-pencil',
        className,
      )}
    >
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={shape.strokeWidth}
        className={cn(
          '[stroke-dasharray:1]',
          animate && 'motion-safe:animate-[pencil-draw_var(--duration-base)_var(--ease-out)_both]',
        )}
      />
    </svg>
  );
}

export { PencilMark, type PencilMarkProps, type PencilMarkVariant };
