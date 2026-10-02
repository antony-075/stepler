'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { cn } from '../lib/utils';

/**
 * The white frame a QR sits in (DESIGN-SYSTEM.md §5.15): padding 8, radius 2, a 1px edge, no
 * shadow, white in both themes. Its child fills it. Empty, it is a dashed placeholder.
 */
function QrFrame({ className, children }: { className?: string; children?: ReactNode }) {
  const empty = children === null || children === undefined;
  return (
    <div
      data-slot="qr-frame"
      className={cn(
        'grid shrink-0 overflow-hidden rounded-frame p-2 *:size-full',
        empty ? 'border border-dashed' : 'border bg-[#FFFFFF]',
        className,
      )}
    >
      {children}
    </div>
  );
}

type RotationPhase = 'idle' | 'cross' | 'fade';

/** How long the old code is crossed out, then how long the crossfade takes (§8). */
const CROSS_MS = 200;
const FADE_MS = 180;

/**
 * Replaces a QR code visibly when its link is rotated (DESIGN-SYSTEM.md §8): when `rotationKey`
 * changes, the old code is crossed out with a muted stroke (200ms; it is not an error), then
 * crossfades to the new one (180ms). Under reduced motion the new code is simply there (the
 * caller's toast says the link was replaced). The old code is the one shown when its key first
 * appeared, which is the same picture: a key's QR does not change.
 */
function RotatingQr({ rotationKey, children }: { rotationKey: string; children: ReactNode }) {
  const [current, setCurrent] = useState({ key: rotationKey, node: children });
  const [leaving, setLeaving] = useState<ReactNode>(null);
  const [phase, setPhase] = useState<RotationPhase>('idle');

  // Derived from the previous render (React's "storing information from previous renders").
  if (current.key !== rotationKey) {
    setLeaving(current.node);
    setCurrent({ key: rotationKey, node: children });
    setPhase('cross');
  }

  useEffect(() => {
    if (phase === 'idle') return;
    const timer = setTimeout(
      () => {
        if (phase === 'cross') {
          setPhase('fade');
        } else {
          setPhase('idle');
          setLeaving(null);
        }
      },
      phase === 'cross' ? CROSS_MS : FADE_MS,
    );
    return () => clearTimeout(timer);
  }, [phase]);

  const rotating = phase !== 'idle' && leaving !== null;
  return (
    <div
      data-slot="rotating-qr"
      data-phase={phase}
      className="grid size-full *:col-start-1 *:row-start-1"
    >
      <div
        data-slot="rotating-qr-current"
        className={cn(
          'size-full *:size-full motion-safe:transition-opacity motion-safe:duration-(--duration-base)',
          { 'motion-safe:opacity-0': phase === 'cross' },
        )}
      >
        {children}
      </div>
      {rotating ? (
        <div
          aria-hidden="true"
          data-slot="rotating-qr-leaving"
          className={cn(
            'relative size-full *:size-full motion-reduce:hidden motion-safe:transition-opacity motion-safe:duration-(--duration-base)',
            { 'opacity-0': phase === 'fade' },
          )}
        >
          {leaving}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            // The QR is a light island in both themes, so the stroke uses light-theme muted ink.
            className="absolute inset-0 overflow-visible text-[#5A5D58]"
          >
            <path
              d="M6 10 C34 34 64 64 94 92 M92 8 C64 36 36 62 8 90"
              pathLength={1}
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="[stroke-dasharray:1] [stroke-dashoffset:1] [animation:pencil-draw_200ms_var(--ease-out)_forwards]"
            />
          </svg>
        </div>
      ) : null}
    </div>
  );
}

export { QrFrame, RotatingQr };
