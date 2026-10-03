// FrameGrid: the contact sheet (DESIGN-SYSTEM.md §5.10, §7.2).
// Design pass: columns follow the width of the grid's own container, not the viewport, because
// the same sheet lives in a full page, a centred guest column and beside a details panel.
// Frames are separated by 1px lines (`--border`), drawn as each cell's 1px outer shadow; there is
// no sheet behind them, so an unfilled row shows the page. A list: one item per frame, keyboard order is
// the visual order.
import { Children, isValidElement, type ReactNode } from 'react';
import { cn } from '../lib/utils';

type FrameGridProps = {
  children: ReactNode;
  /** Names the list, e.g. «Кадри колекції». */
  ariaLabel: string;
  /** `dense`: 4px frame padding (the admin's opt-in «Щільно»). */
  density?: 'default' | 'dense';
  className?: string;
};

// Columns by container width (owner review 2026-10-03: §7.2's 104/112/128px frames read as tiny
// on a desktop, so frames are larger from 640px). `--cols = floor((W + 1) / (minFrame + 1))` with
// minFrame 104 below 640 (3 to 5 columns), 140 from 640 and 168 from 1024, at most 10, unrolled
// into container-query steps (each the smallest width for one more column). Below 640: 3 → 4 at
// 419, 5 at 524; 640–1023: 4, 5 at 704, 6 at 845, 7 at 986; from 1024: 6, 7 at 1182, 8 at 1351,
// 9 at 1520, 10 at 1689.
const COLUMN_STEPS = cn(
  '[--cols:3]',
  '@min-[419px]:[--cols:4] @min-[524px]:[--cols:5]',
  '@min-[640px]:[--cols:4] @min-[704px]:[--cols:5] @min-[845px]:[--cols:6] @min-[986px]:[--cols:7]',
  '@min-[1024px]:[--cols:6] @min-[1182px]:[--cols:7] @min-[1351px]:[--cols:8] @min-[1520px]:[--cols:9] @min-[1689px]:[--cols:10]',
);

/** Up to this many frames the sheet is a short strip of larger frames, not a mostly empty row. */
const FEW = 3;

// A few frames: two columns on a phone (about 165px at 360), three from 419px, each at most 240px,
// left-aligned; the rest of the row is the page, not an empty sheet.
const FEW_COLUMNS =
  'grid-cols-[repeat(2,minmax(0,240px))] @min-[419px]:grid-cols-[repeat(3,minmax(0,240px))]';

/**
 * The contact sheet: equal frames in 3 to 10 columns by container width, 1px grid lines. Only the
 * frames are sheet: a short last row (or a short list) leaves the page showing, never an empty
 * white box. With 1–3 frames they are larger (up to 240px). Children are `Frame`s; each becomes a
 * list item.
 */
function FrameGrid({ children, ariaLabel, density = 'default', className }: FrameGridProps) {
  const items = Children.toArray(children);
  const few = items.length <= FEW;
  return (
    <div
      data-slot="frame-grid"
      data-few={few ? '' : undefined}
      className={cn(
        '@container',
        density === 'dense' ? '[--frame-pad:4px]' : '[--frame-pad:8px]',
        className,
      )}
    >
      {/* 1px inset so the outer lines (each cell's 1px shadow) are never clipped. */}
      <ul
        aria-label={ariaLabel}
        className={cn(
          'grid gap-px p-px',
          few ? FEW_COLUMNS : cn('grid-cols-[repeat(var(--cols),minmax(0,1fr))]', COLUMN_STEPS),
        )}
      >
        {items.map((child, index) => (
          <li
            key={isValidElement(child) && child.key !== null ? child.key : index}
            className="min-w-0 shadow-[0_0_0_1px_var(--border)]"
          >
            {child}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { FrameGrid, type FrameGridProps };
