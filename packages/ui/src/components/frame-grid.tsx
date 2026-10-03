// FrameGrid: the contact sheet (DESIGN-SYSTEM.md §5.10, §7.2).
// Design pass: columns follow the width of the grid's own container, not the viewport, because
// the same sheet lives in a full page, a centred guest column and beside a details panel.
// `--cols = clamp(3, floor((W + 1) / (minFrame + 1)), 12)` with minFrame 104 below 640px, 112 to
// 1023px and 128 from 1024px; CSS cannot floor a length ratio everywhere yet, so the formula is
// unrolled into container-query steps (each step is the smallest width for one more column).
// Frames are separated by 1px lines (`--border`), drawn as each cell's 1px outer shadow so an
// unfilled last row stays plain sheet, not grey. A list: one item per frame, keyboard order is
// the visual order.
import { Children, type ReactNode } from 'react';
import { cn } from '../lib/utils';

type FrameGridProps = {
  children: ReactNode;
  /** Names the list, e.g. «Кадри колекції». */
  ariaLabel: string;
  /** `dense`: 4px frame padding (the admin's opt-in «Щільно»). */
  density?: 'default' | 'dense';
  className?: string;
};

// Steps of §7.2 (container width → columns). Below 640: 3 → 4 at 419, 5 at 524, 6 at 629;
// 640–1023: 5, 6 at 677, 7 at 790, 8 at 903, 9 at 1016; from 1024: 7, 8 at 1031, 9 at 1160,
// 10 at 1289, 11 at 1418, 12 at 1547.
const COLUMN_STEPS = cn(
  '[--cols:3]',
  '@min-[419px]:[--cols:4] @min-[524px]:[--cols:5] @min-[629px]:[--cols:6]',
  '@min-[640px]:[--cols:5] @min-[677px]:[--cols:6] @min-[790px]:[--cols:7] @min-[903px]:[--cols:8] @min-[1016px]:[--cols:9]',
  '@min-[1024px]:[--cols:7] @min-[1031px]:[--cols:8] @min-[1160px]:[--cols:9] @min-[1289px]:[--cols:10] @min-[1418px]:[--cols:11] @min-[1547px]:[--cols:12]',
);

/**
 * The contact sheet: equal frames in 3 to 12 columns by container width, 1px grid lines, one
 * sheet with a 4px radius. Children are `Frame`s; each becomes a list item.
 */
function FrameGrid({ children, ariaLabel, density = 'default', className }: FrameGridProps) {
  return (
    <div
      data-slot="frame-grid"
      className={cn(
        '@container overflow-hidden rounded-sheet border bg-card',
        density === 'dense' ? '[--frame-pad:4px]' : '[--frame-pad:6px]',
        className,
      )}
    >
      <ul
        aria-label={ariaLabel}
        className={cn('grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-px', COLUMN_STEPS)}
      >
        {Children.map(children, (child) =>
          child === null || child === undefined || child === false ? null : (
            <li className="min-w-0 shadow-[0_0_0_1px_var(--border)]">{child}</li>
          ),
        )}
      </ul>
    </div>
  );
}

export { FrameGrid, type FrameGridProps };
