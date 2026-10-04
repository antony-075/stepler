'use client';

// FrameViewer: one frame on a dark stage (DESIGN-SYSTEM.md §5.12, §8, §9).
// Design pass: the picture is everything, so the viewer is a dark stage (`--viewer` in both
// themes) with thin chrome: the frame's mono title on the left, its actions and «Закрити» on the
// right, previous/next at the sides (44px, on a dark disc so they read over any photo), details
// below. Phones and tablets: full screen. From `lg` (owner review 2026-10-03) a large centred
// dialog (up to 1100px × 85vh, 12px radius) over a dimmed page, with the details as a 288px panel
// on the right, so a desktop keeps its context and the details never sit under page chrome. Radix Dialog gives the focus trap, Escape and focus return to the opening frame. ←/→
// step between frames; on touch a horizontal swipe of 48px does the same (always with buttons).
// Focus is the dark violet ring (`--viewer-ring`), secondary text `--viewer-muted`, in both themes. Opening fades (180ms); none under reduced
// motion. Media scales to fit (`object-fit: contain`), never past the screen.
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef } from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';

/** A horizontal swipe at least this long (and more horizontal than vertical) changes frame. */
const SWIPE_PX = 48;

type FrameViewerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The frame's heading, e.g. `#086` with the time and the contributor's name. */
  title: ReactNode;
  /**
   * The media: an `<img>`, a `<video controls>`, a document tile or a text. A long text scrolls
   * in its own box with `tabIndex={0}`, so it can be scrolled from the keyboard.
   */
  children: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  /** Buttons in the top bar before «Закрити» («Завантажити», «Видалити»). */
  actions?: ReactNode;
  /** Metadata under the media. */
  details?: ReactNode;
  closeLabel: string;
  prevLabel: string;
  nextLabel: string;
  /**
   * Where focus goes on close: the frame now shown (after ←/→ it is not the one that opened the
   * viewer). Default: the element that had focus when the viewer opened.
   */
  returnFocus?: () => HTMLElement | null | undefined;
};

const viewerButton = cn(
  'inline-flex size-11 shrink-0 items-center justify-center rounded-control text-viewer-foreground transition-colors duration-(--duration-fast) hover:bg-[rgb(255_255_255/0.12)] motion-reduce:transition-none',
  focusRing,
);

const sideButton = cn(
  viewerButton,
  'absolute top-1/2 z-(--z-frame-mark) -translate-y-1/2 rounded-full bg-[rgb(0_0_0/0.45)] hover:bg-[rgb(0_0_0/0.65)] disabled:hidden',
);

/** Keys inside these belong to the element (a video seeks with arrows). */
function ownsArrowKeys(target: EventTarget): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLVideoElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * One frame on the dark viewer surface: full screen below `lg`, a large centred dialog from it. Controlled (`open`); the caller
 * keeps the open frame in the URL (`?frame=86`) and passes `onPrev`/`onNext` while there is a
 * neighbour.
 */
function FrameViewer({
  open,
  onOpenChange,
  title,
  children,
  onPrev,
  onNext,
  actions,
  details,
  closeLabel,
  prevLabel,
  nextLabel,
  returnFocus,
}: FrameViewerProps) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || ownsArrowKeys(event.target)) return;
    if (event.key === 'ArrowLeft' && onPrev) {
      event.preventDefault();
      onPrev();
    } else if (event.key === 'ArrowRight' && onNext) {
      event.preventDefault();
      onNext();
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return;
    start.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const from = start.current;
    start.current = null;
    if (from === null) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) onNext?.();
    else onPrev?.();
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="frame-viewer-overlay"
          className="fixed inset-0 z-(--z-overlay) bg-viewer lg:bg-[rgb(0_0_0/0.72)] animation-duration-[var(--duration-base)] motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0"
        />
        <DialogPrimitive.Content
          data-slot="frame-viewer"
          aria-describedby={undefined}
          onKeyDown={handleKeyDown}
          // Opened without a Radix trigger, so Radix has nowhere to return focus: we do (§9).
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (returnFocus?.() ?? opener.current)?.focus();
          }}
          className="fixed inset-0 z-(--z-modal) flex flex-col bg-viewer text-viewer-foreground outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:h-[85dvh] lg:w-[min(1100px,calc(100vw-4rem))] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:overflow-hidden lg:rounded-dialog lg:border lg:border-[rgb(255_255_255/0.1)] lg:shadow-[0_32px_64px_-24px_rgb(0_0_0/0.6)] [--muted-foreground:var(--viewer-muted)] [--ring:var(--viewer-ring)] animation-duration-[var(--duration-base)] motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0"
        >
          <div className="flex items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-4 lg:border-b lg:border-[rgb(255_255_255/0.1)] lg:py-2 lg:pr-2">
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate pl-2 type-data text-[0.9375rem]">
              {title}
            </DialogPrimitive.Title>
            {actions}
            <DialogPrimitive.Close aria-label={closeLabel} className={viewerButton}>
              <X aria-hidden="true" className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div
              data-slot="frame-viewer-stage"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                start.current = null;
              }}
              className="relative flex min-h-0 min-w-0 flex-1 touch-pan-y items-center justify-center px-2 pb-2 sm:px-16 lg:py-6"
            >
              {/* Pictures fit the stage; any other child (a text card) sizes itself within it. */}
              <div className="flex size-full min-h-0 min-w-0 items-center justify-center [overflow-wrap:anywhere] [&>img]:max-h-full [&>img]:max-w-full [&>img]:object-contain [&>video]:max-h-full [&>video]:max-w-full [&>video]:object-contain">
                {children}
              </div>
              {onPrev ? (
                <button
                  type="button"
                  aria-label={prevLabel}
                  onClick={onPrev}
                  className={cn(sideButton, 'left-2')}
                >
                  <ChevronLeft aria-hidden="true" className="size-6" />
                </button>
              ) : null}
              {onNext ? (
                <button
                  type="button"
                  aria-label={nextLabel}
                  onClick={onNext}
                  className={cn(sideButton, 'right-2')}
                >
                  <ChevronRight aria-hidden="true" className="size-6" />
                </button>
              ) : null}
            </div>
            {details ? (
              <div
                data-slot="frame-viewer-details"
                className="max-h-[40dvh] overflow-y-auto border-t border-[rgb(255_255_255/0.12)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[0.9375rem] lg:max-h-none lg:w-72 lg:shrink-0 lg:border-t-0 lg:border-l lg:px-5 lg:py-5"
              >
                {details}
              </div>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { FrameViewer, type FrameViewerProps };
