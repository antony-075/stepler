// PrintStack: the guest's success moment, borrowed from direction B (DESIGN-SYSTEM.md §5.18,
// §6.3, §8 "PrintStack укладка").
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - The one place in the system where frames rotate (±1.5°), overlap and cast a shadow: up to
//   three of the guest's own prints, the newest on top, level and with the print elevation.
// - A print is a `--card` sheet, 8px padding with a 24px foot for the mono «#087» (radius 2).
// - The stack is 220px wide on 320px phones, 260px from 375px and 320px from 1024px; prints
//   share one grid cell, so the stack's height follows the prints and nothing is absolutely
//   positioned.
// - Motion, once per batch: each print rises 28px and fades in, 60ms apart (left, right, top),
//   400ms ease-out; then the pictures develop (300ms fade). Under reduced motion the stack is
//   still, rotation kept (rotation is not motion), pictures shown at once. Rotation uses the
//   `rotate` property, so the entrance's `transform` never fights it.
// - `role="img"` with one name («Ваші кадри: 30»); everything inside is decorative.
import type { ReactNode } from 'react';
import { formatFrameNumber } from '../lib/frame-number';
import { cn } from '../lib/utils';

type Print = {
  key: string;
  /** `<img alt="">` of a local preview, or a type tile. */
  image: ReactNode;
  frameNo?: number;
};

type PrintStackProps = {
  /** 1–3 prints, oldest first; the last one lies on top. Extra prints are ignored. */
  prints: readonly Print[];
  /** The stack's accessible name, e.g. «Ваші кадри: 30». */
  label: string;
  className?: string;
};

type Placement = { className: string; delayMs: number };

// Where each print lies, by how many there are. The top print is always last and level.
const PLACEMENTS: Record<1 | 2 | 3, readonly Placement[]> = {
  1: [{ className: 'z-3', delayMs: 0 }],
  2: [
    { className: 'z-1 -translate-x-[9%] -translate-y-[3%] -rotate-[1.5deg]', delayMs: 0 },
    { className: 'z-3 translate-x-[5%] translate-y-[2%] shadow-print', delayMs: 60 },
  ],
  3: [
    { className: 'z-1 -translate-x-[11%] -translate-y-[2%] -rotate-[1.5deg]', delayMs: 0 },
    { className: 'z-2 translate-x-[11%] -translate-y-[5%] rotate-[1.5deg]', delayMs: 60 },
    { className: 'z-3 translate-y-[4%] shadow-print', delayMs: 120 },
  ],
};

/** The guest's last own prints, stacked by hand. Only on the guest's success screen. */
function PrintStack({ prints, label, className }: PrintStackProps) {
  const shown = prints.slice(-3);
  const count = Math.max(1, Math.min(3, shown.length)) as 1 | 2 | 3;
  const placements = PLACEMENTS[count];
  if (shown.length === 0) return null;
  return (
    <div
      data-slot="print-stack"
      role="img"
      aria-label={label}
      className={cn(
        'grid w-[220px] place-items-center px-[8%] py-[6%] min-[375px]:w-[260px] lg:w-[320px]',
        className,
      )}
    >
      {shown.map((print, index) => {
        const placement = placements[index] ?? placements[placements.length - 1]!;
        return (
          // The wrapper takes the entrance (transform + opacity); the print inside keeps its
          // place and rotation.
          <div
            key={print.key}
            className="col-start-1 row-start-1 w-full motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-7 motion-safe:duration-(--duration-stack) motion-safe:ease-(--ease-out) motion-safe:[animation-fill-mode:both]"
            style={{ animationDelay: `${placement.delayMs}ms` }}
          >
            <div
              data-slot="print"
              className={cn(
                'relative grid gap-1 rounded-frame bg-card p-2 pb-1 shadow-[0_0_0_1px_var(--border)]',
                placement.className,
              )}
            >
              <div className="aspect-square w-full overflow-hidden rounded-frame bg-muted *:size-full *:object-cover">
                <div
                  className="size-full *:size-full *:object-cover motion-safe:animate-in motion-safe:fade-in motion-safe:duration-(--duration-develop) motion-safe:ease-(--ease-out) motion-safe:[animation-fill-mode:both]"
                  style={{ animationDelay: `${placement.delayMs + 400}ms` }}
                >
                  {print.image}
                </div>
              </div>
              <span
                aria-hidden="true"
                translate="no"
                className="flex h-5 items-center type-data font-medium text-foreground"
              >
                {print.frameNo === undefined ? null : formatFrameNumber(print.frameNo)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { PrintStack, type Print, type PrintStackProps };
