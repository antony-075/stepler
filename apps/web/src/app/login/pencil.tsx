import { cn } from '@stepler/ui/lib/utils';

// The hand-drawn loop of the C artboards; it starts and ends slightly apart, like a pencil.
const LOOP =
  'M60 3 C84 5 98 22 97 49 C96 77 77 97 49 96 C22 95 3 77 4 50 C5 24 22 5 49 4 C57 4 64 6 69 9';

// A quick, slightly uneven underline.
const UNDERLINE = 'M2 6 C20 3.5 42 4.5 62 4 C76 3.6 88 4.4 98 3';

/**
 * The wax-pencil loop around one frame of the landing sheet (DESIGN-SYSTEM.md §5.13, §8): drawn
 * once on load (400ms after 300ms), whole under reduced motion. It rings the photo and reaches 4px
 * into the frame's 6px margin, so it stays inside the sheet and never widens the page. The stroke is in viewBox units and scales with the
 * frame (`non-scaling-stroke` would break the `pathLength` draw), so its width steps with the
 * frame's width (`@container/frame`) to stay about 2.5px.
 */
export function PencilLoop() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute -inset-1 z-(--z-frame-mark) size-[calc(100%+0.5rem)] overflow-visible"
    >
      <path
        data-pencil-mark="loop"
        d={LOOP}
        pathLength={1}
        fill="none"
        stroke="var(--pencil)"
        strokeLinecap="round"
        className="[stroke-dasharray:1] [stroke-width:3] @min-[110px]/frame:[stroke-width:2.3] @min-[140px]/frame:[stroke-width:1.9] @min-[170px]/frame:[stroke-width:1.6] motion-safe:animate-[pencil-draw_400ms_var(--ease-out)_300ms_both]"
      />
    </svg>
  );
}

/**
 * A pencil underline under a short label («нове»). The box is 8px tall at viewBox scale 1 on the
 * y axis, so the (mostly horizontal) stroke stays 2.5px thick at any label width. Static by default; the reveal of «Як це
 * працює» draws it when the section first scrolls into view (`data-reveal`, see `Reveal`).
 */
export function PencilUnderline({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      className={cn('pointer-events-none absolute inset-x-0 -bottom-1.5 h-2 w-full', className)}
    >
      <path
        data-pencil-mark="underline"
        d={UNDERLINE}
        pathLength={1}
        fill="none"
        stroke="var(--pencil)"
        strokeLinecap="round"
        strokeWidth={2.5}
        className="[stroke-dasharray:1] group-data-[reveal=armed]/reveal:[stroke-dashoffset:1] group-data-[reveal=shown]/reveal:animate-[pencil-draw_240ms_var(--ease-out)_520ms_both]"
      />
    </svg>
  );
}
