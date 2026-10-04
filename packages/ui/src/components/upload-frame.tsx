// UploadFrame: one of the guest's files on its way into the collection (DESIGN-SYSTEM.md §5.11,
// §8 "Frame fill", §9 "Скринридеры").
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - The same square tile as `Frame` (8px radius, no cell around it; owner remark 62, 2026-10-04)
//   with the mono status line under it, so a finished upload becomes a frame in place: nothing
//   jumps when it turns into «Додано #087».
// - Progress is the picture itself developing: a `--veil` over the media shrinks upwards
//   (`scaleY(1 − p)`, origin top, linear, no transition under reduced motion: it is data), with a
//   1.5px pencil edge while bytes move and the percent in pencil mono. No text sits on the veil.
// - Position «1 з 6» until the backend confirms; the real number only after (§11.1).
// - Failed is never colour alone: dimmed photo, a destructive pencil cross, «Не вдалося» and a
//   44px «Повторити» across the frame, outside the named group so it is its own control.
// - Cancel is a 44px corner target (a 24px disc inside) on queued and uploading frames only.
// - One accessible name per frame with the state (and the reason when failed); per-percent
//   changes are not announced here: `UploadSummary` owns the aggregated live region.
import { Check, File, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { focusRing } from '../lib/focus';
import { formatFrameNumber } from '../lib/frame-number';
import { cn } from '../lib/utils';
import { Button } from './button';
import { PencilMark } from './pencil-mark';

type UploadFrameState = 'queued' | 'uploading' | 'processing' | 'done' | 'failed';

type UploadFrameLabels = {
  queued: string;
  processing: string;
  done: string;
  failed: string;
  retry: string;
  /** Names the cancel control, e.g. «Скасувати: кадр 2 з 6». */
  cancel: string;
  /** «1 з 6». */
  position: (index: number, total: number) => string;
  /** «40%», from a whole number 0–100. */
  percent: (value: number) => string;
};

type UploadFrameProps = {
  state: UploadFrameState;
  /** 0–100 while uploading; clamped. */
  progress?: number;
  /** A local preview (`<img alt="">` from `URL.createObjectURL`), or a type tile. */
  preview?: ReactNode;
  /** 1-based place in the batch, shown until the frame is done. */
  position: { index: number; total: number };
  /** The real frame number, once the backend has recorded the file. */
  frameNo?: number;
  /** Why it failed; added to the accessible name. */
  reason?: string;
  /** The frame's name with its state, e.g. «Кадр 6 з 30, не вдалося». */
  accessibleName: string;
  labels: UploadFrameLabels;
  onRetry?: () => void;
  onCancel?: () => void;
  className?: string;
};

function StatusText({
  state,
  percent,
  labels,
}: {
  state: UploadFrameState;
  percent: number;
  labels: UploadFrameLabels;
}) {
  switch (state) {
    case 'queued':
      return <span className="text-muted-foreground">{labels.queued}</span>;
    case 'uploading':
      return <span className="font-medium text-pencil">{labels.percent(Math.floor(percent))}</span>;
    case 'processing':
      return (
        <span className="flex items-center gap-1 text-muted-foreground">
          {/* Spinner's ring without its status role: the frame's name already says it. */}
          <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none motion-reduce:border-r-current motion-reduce:opacity-60" />
          {labels.processing}
        </span>
      );
    case 'done':
      return (
        <span className="flex items-center gap-1 text-success motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-(--duration-base)">
          <Check className="size-3.5" strokeWidth={3} />
          {labels.done}
        </span>
      );
    case 'failed':
      return <span className="font-medium text-destructive">{labels.failed}</span>;
  }
}

/**
 * A file in the guest's upload batch: the frame sheet with a veil that lifts as bytes arrive,
 * then «Додано» and the real number. A named group; «Повторити» (failed) and the corner cancel
 * (queued, uploading) are separate controls next to it.
 */
function UploadFrame({
  state,
  progress = 0,
  preview,
  position,
  frameNo,
  reason,
  accessibleName,
  labels,
  onRetry,
  onCancel,
  className,
}: UploadFrameProps) {
  const percent = Math.min(100, Math.max(0, progress));
  const veil = state === 'queued' ? 1 : state === 'uploading' ? 1 - percent / 100 : 0;
  const name = state === 'failed' && reason ? `${accessibleName}: ${reason}` : accessibleName;
  const canCancel = onCancel !== undefined && (state === 'queued' || state === 'uploading');

  return (
    <div
      data-slot="upload-frame"
      data-state={state}
      className={cn('relative flex min-w-0 flex-col gap-1', className)}
    >
      <div
        role="group"
        aria-label={name}
        aria-busy={state === 'uploading' || state === 'processing' ? true : undefined}
        className="grid w-full min-w-0"
      >
        <div
          aria-hidden="true"
          className="relative aspect-square w-full overflow-hidden rounded-control bg-muted"
        >
          <div
            className={cn(
              'size-full *:size-full *:object-cover',
              state === 'failed' && 'opacity-55',
            )}
          >
            {preview ?? (
              <div className="grid place-items-center text-muted-foreground">
                <File className="size-5" />
              </div>
            )}
          </div>
          {veil > 0 ? (
            <div
              data-slot="upload-veil"
              className="absolute inset-0 z-(--z-frame-mark) origin-top bg-veil transition-transform duration-(--duration-fast) ease-linear motion-reduce:transition-none"
              style={{ transform: `scaleY(${veil})` }}
            />
          ) : null}
          {state === 'uploading' ? (
            <div className="absolute inset-0 z-(--z-frame-mark) rounded-control shadow-[inset_0_0_0_1.5px_var(--pencil)]" />
          ) : null}
          {state === 'failed' ? (
            <PencilMark
              variant="cross"
              seed={position.index}
              className="absolute inset-[18%] z-(--z-frame-mark) size-[64%]"
            />
          ) : null}
        </div>
        <div
          aria-hidden="true"
          className="flex min-w-0 flex-wrap items-baseline gap-x-2 px-0.5 pt-1 type-data whitespace-nowrap"
        >
          <span translate="no" className="shrink-0 font-medium text-foreground">
            {state === 'done' && frameNo !== undefined
              ? formatFrameNumber(frameNo)
              : labels.position(position.index, position.total)}
          </span>
          {/* In a narrow frame the status wraps under the position rather than being cut. */}
          <span className="ml-auto min-w-0">
            <StatusText state={state} percent={percent} labels={labels} />
          </span>
        </div>
      </div>
      {canCancel ? (
        <button
          type="button"
          aria-label={labels.cancel}
          onClick={onCancel}
          className={cn(
            'group/cancel absolute top-0 right-0 z-(--z-frame-mark) grid size-11 cursor-pointer touch-manipulation place-items-center rounded-control',
            focusRing,
            'focus-visible:outline-offset-[-2px]',
          )}
        >
          <span className="grid size-6 place-items-center rounded-full bg-card text-foreground shadow-[0_0_0_1px_var(--border)] transition-colors duration-(--duration-fast) group-hover/cancel:bg-hover-card motion-reduce:transition-none">
            <X className="size-3.5" strokeWidth={2.5} />
          </span>
        </button>
      ) : null}
      {state === 'failed' && onRetry !== undefined ? (
        <Button variant="outline" className="w-full" onClick={onRetry}>
          {labels.retry}
        </Button>
      ) : null}
    </div>
  );
}

export { UploadFrame, type UploadFrameLabels, type UploadFrameProps, type UploadFrameState };
