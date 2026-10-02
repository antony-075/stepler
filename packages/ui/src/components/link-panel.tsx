'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { Badge } from './badge';

/*
 * Design (DESIGN-SYSTEM.md §5.15, §6.7, §7.1; artboard C-gallery, access aside):
 * - One panel per link a guest will actually be handed: the title and its status tag share the
 *   first line, so "is it working?" is answered before anything else.
 * - The QR is the memorable object, so it is the only thing that changes size: 180px on a
 *   screen under 375px, 200px from 375px, 160px on the left once the panel is wide enough for
 *   two columns. It sits in a frame like a contact-sheet frame (white, padding 8,
 *   radius 2, a 1px edge, no shadow) and stays white in dark mode: scanning beats theming.
 * - The two-column switch comes from the panel's width, not the viewport (`@container`), so
 *   the same panel works in the page column and in a dialog.
 * - Phone: everything stacks and every action button is full width (thumb reach, no ragged
 *   rows); wide: the details column reads top-down: notice, link, what guests can do, actions.
 */

type LinkStatus = 'active' | 'paused';

type LinkPanelProps = {
  /** The link's name, rendered as the panel's h2 (e.g. «Гостьове посилання»). */
  title: ReactNode;
  status: LinkStatus;
  /** The status in words (e.g. «Активне»); the dot is decoration. */
  statusLabel: string;
  /** The QR code (it fills the frame); `null` draws an empty frame (no URL to encode). */
  qr: ReactNode;
  /** A `CopyField` with the link; `null` when the link cannot be shown. */
  copyField: ReactNode;
  /** What guests may do, in words. */
  permissionsSummary: ReactNode;
  /** Buttons; full width on a phone-narrow panel. */
  actions: ReactNode;
  /** An Alert above the details (paused, hidden link, archived collection…). */
  notice?: ReactNode;
  className?: string;
};

function LinkPanel({
  title,
  status,
  statusLabel,
  qr,
  copyField,
  permissionsSummary,
  actions,
  notice,
  className,
}: LinkPanelProps) {
  return (
    <section
      data-slot="link-panel"
      data-status={status}
      className={cn(
        '@container/link-panel grid min-w-0 gap-4 rounded-sheet border bg-card p-4 text-card-foreground sm:p-6',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="type-h3 min-w-0 [overflow-wrap:anywhere]">{title}</h2>
        <Badge variant={status === 'active' ? 'success' : 'warning'}>{statusLabel}</Badge>
      </div>
      {/* Two columns from a 34rem (544px) panel: a 640px screen minus the page gutters. */}
      <div
        className={cn(
          'grid min-w-0 gap-4',
          '@[34rem]/link-panel:grid-cols-[auto_minmax(0,1fr)] @[34rem]/link-panel:items-start @[34rem]/link-panel:gap-6',
        )}
      >
        <QrFrame
          className={cn(
            'size-[180px] justify-self-center min-[375px]:size-[200px]',
            '@[34rem]/link-panel:size-[160px] @[34rem]/link-panel:justify-self-start',
          )}
        >
          {qr}
        </QrFrame>
        <div data-slot="link-panel-details" className="grid min-w-0 gap-4">
          {notice}
          {copyField}
          <div className="type-small min-w-0 text-pretty [overflow-wrap:anywhere]">
            {permissionsSummary}
          </div>
          <div
            data-slot="link-panel-actions"
            className={cn(
              'flex min-w-0 flex-col gap-2 *:w-full',
              '@[34rem]/link-panel:flex-row @[34rem]/link-panel:flex-wrap @[34rem]/link-panel:*:w-auto',
            )}
          >
            {actions}
          </div>
        </div>
      </div>
    </section>
  );
}

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

export { LinkPanel, QrFrame, RotatingQr, type LinkPanelProps, type LinkStatus };
