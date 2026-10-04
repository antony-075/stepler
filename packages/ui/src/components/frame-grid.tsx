// FrameGrid: the photo grid (DESIGN-SYSTEM.md §5.10, §7.2).
// Design pass: columns follow the width of the grid's own container, not the viewport, because
// the same grid lives in a full page, a centred guest column and beside a details panel.
// Owner decision 2026-10-04 (remark 62): borderless tiles with gaps (6px, 8px from a 640px
// container), as in Google Photos, instead of the contact sheet's 1px lines; nothing behind them,
// so an unfilled row shows the page. A list: one item per frame, keyboard order is the visual
// order.
import { Children, isValidElement, type ReactNode } from 'react';
import { cn } from '../lib/utils';

type FrameGridProps = {
  children: ReactNode;
  /** Names the list, e.g. «Кадри колекції». */
  ariaLabel: string;
  /** `dense`: 4px gaps (the admin's opt-in «Щільно»). */
  density?: 'default' | 'dense';
  className?: string;
};

// Columns by container width W: as many as fit tiles of at least minFrame with the gaps between
// them (`n * minFrame + (n - 1) * gap <= W`), minFrame 104 with 6px gaps below 640 (3 to 5
// columns), 140 with 8px gaps from 640 and 168 from 1024, at most 10, unrolled into
// container-query steps (each the smallest width for one more column). Below 640: 3 → 4 at 434,
// 5 at 544; 640–1023: 4, 5 at 732, 6 at 880; from 1024: 5, 6 at 1048, 7 at 1224, 8 at 1400,
// 9 at 1576, 10 at 1752.
const COLUMN_STEPS = cn(
  '[--cols:3]',
  '@min-[434px]:[--cols:4] @min-[544px]:[--cols:5]',
  '@min-[640px]:[--cols:4] @min-[732px]:[--cols:5] @min-[880px]:[--cols:6]',
  '@min-[1024px]:[--cols:5] @min-[1048px]:[--cols:6] @min-[1224px]:[--cols:7] @min-[1400px]:[--cols:8] @min-[1576px]:[--cols:9] @min-[1752px]:[--cols:10]',
);

/** Up to this many frames the sheet is a short strip of larger frames, not a mostly empty row. */
const FEW = 3;

// A few frames: two columns on a phone (about 165px at 360), three from 419px, each at most 240px,
// left-aligned; the rest of the row is the page, not an empty sheet.
const FEW_COLUMNS =
  'grid-cols-[repeat(2,minmax(0,240px))] @min-[419px]:grid-cols-[repeat(3,minmax(0,240px))]';

/**
 * The photo grid: equal square tiles in 3 to 10 columns by container width, with gaps and no
 * lines. A short last row (or a short list) leaves the page showing. With 1–3 frames they are
 * larger (up to 240px). Children are `Frame`s; each becomes a list item.
 */
function FrameGrid({ children, ariaLabel, density = 'default', className }: FrameGridProps) {
  const items = Children.toArray(children);
  const few = items.length <= FEW;
  return (
    <div
      data-slot="frame-grid"
      data-few={few ? '' : undefined}
      className={cn('@container', className)}
    >
      <ul
        aria-label={ariaLabel}
        className={cn(
          'grid',
          density === 'dense' ? 'gap-1' : 'gap-1.5 @min-[640px]:gap-2',
          few ? FEW_COLUMNS : cn('grid-cols-[repeat(var(--cols),minmax(0,1fr))]', COLUMN_STEPS),
        )}
      >
        {items.map((child, index) => (
          <li
            key={isValidElement(child) && child.key !== null ? child.key : index}
            className="min-w-0"
          >
            {child}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { FrameGrid, type FrameGridProps };
