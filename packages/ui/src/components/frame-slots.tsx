import type { CSSProperties } from 'react';
import { cn } from '../lib/utils';
import { FRAME_TINT_CLASSES, FRAME_TINTS, type FrameTint } from '../lib/frame-tints';
import { formatFrameNumber } from './empty-state';

type FrameSlotsProps = {
  /** How many empty slots to draw. */
  count: number;
  /**
   * One tint for every slot (a collection's own, chosen from its id). Omitted, the slots walk
   * through all tints in order: the composition of a dashboard that has no collection yet.
   */
  tint?: FrameTint;
  /** The number of the first slot (`#001`). */
  start?: number;
  /**
   * Columns of the grid; defaults to `count` (one row). Set it lower to wrap, e.g. 3 for two
   * rows of three.
   */
  columns?: number;
  className?: string;
};

/**
 * Empty, numbered frames waiting for their content (DESIGN-SYSTEM.md §5.10, §5.16): equal
 * squares in a calm tint with the frame number inside. Flat like every frame: no rotation,
 * overlap or shadow. Purely decorative, so it is hidden from assistive technology; the caller
 * says in words what the empty space means.
 */
function FrameSlots({ count, tint, start = 1, columns = count, className }: FrameSlotsProps) {
  return (
    <div
      data-slot="frame-slots"
      aria-hidden="true"
      style={{ '--frame-slot-columns': columns } as CSSProperties}
      className={cn(
        'grid grid-cols-[repeat(var(--frame-slot-columns),minmax(0,1fr))] gap-1',
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => {
        const slotTint = tint ?? FRAME_TINTS[index % FRAME_TINTS.length] ?? FRAME_TINTS[0];
        return (
          <div
            key={index}
            data-slot="frame-slot"
            data-tint={slotTint}
            className={cn(
              'flex aspect-square min-w-0 items-end rounded-frame border p-1.5',
              FRAME_TINT_CLASSES[slotTint],
            )}
          >
            <span className="type-data leading-none" translate="no">
              {formatFrameNumber(start + index)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { FrameSlots, type FrameSlotsProps };
