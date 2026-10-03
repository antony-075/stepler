// Frame: one contribution in the contact sheet (DESIGN-SYSTEM.md §5.9, §5.10, §5.13).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - The sheet is the interface: a card with 6/6/4 padding, a square media slot (2px radius) and a
//   mono label (number left, time and data right). No shadow, no rotation; the grid line is the
//   only separator. Content decides colour: neutral `--muted` placeholders, never tinted.
// - One interactive target per frame (a button: open, or toggle in selection mode with
//   `aria-pressed`), named by the caller ("Кадр 86, фото, 21:10, Ірина"); media is aria-hidden.
//   Actions (e.g. «Повторити») sit below it, never nested inside the button.
// - Selection is never colour alone: a 2px pencil edge inside the padding, a pencil circle around
//   the number, a ✓ on a white disc, and `aria-pressed`. "New" is a pencil underline plus the
//   caller's accessible name. Focus is the violet ring drawn inside, so `overflow: hidden` of the
//   grid sheet cannot clip it in the first column.
// - Long content never widens the frame: text clamps to 5 lines, titles break anywhere.
import { Check, FileText, ImageIcon, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { focusRingInset } from '../lib/focus';
import { formatFrameNumber } from '../lib/frame-number';
import { cn } from '../lib/utils';
import { PencilMark } from './pencil-mark';

type FrameKind = 'photo' | 'video' | 'document' | 'text' | 'pending-preview' | 'empty';

type FrameLabelProps = {
  /** Rendered as `#086`; omit it where the viewer may not see numbers (other guests' frames). */
  number?: number;
  time: string;
  /** Data after the time: a video's duration, a file's size or type. */
  meta?: string;
  isNew?: boolean;
  selected?: boolean;
  className?: string;
};

/**
 * The mono line under a frame (DESIGN-SYSTEM.md §5.10): the number on the left, the time and
 * data on the right, a flexible gap between them (no "·" glue). Decorative for assistive
 * technology when the frame carries the accessible name.
 */
function FrameLabel({ number, time, meta, isNew, selected, className }: FrameLabelProps) {
  const seed = number ?? 0;
  const underline = isNew ? (
    <PencilMark
      variant="underline"
      seed={seed}
      className="absolute inset-x-0 -bottom-1 h-1.5 w-full"
    />
  ) : null;
  return (
    <div
      data-slot="frame-label"
      className={cn(
        '@container/label flex min-w-0 items-baseline gap-2 px-0.5 pt-1 type-data',
        className,
      )}
    >
      {number === undefined ? null : (
        <span
          data-slot="frame-number"
          translate="no"
          className="relative shrink-0 font-medium text-foreground"
        >
          {formatFrameNumber(number)}
          {underline}
          {selected ? (
            <PencilMark
              variant="circle"
              seed={seed}
              className="absolute -inset-x-2 -inset-y-1 h-[calc(100%+0.5rem)] w-[calc(100%+1rem)]"
            />
          ) : null}
        </span>
      )}
      <span className="ml-auto flex min-w-0 items-baseline gap-2 text-muted-foreground">
        <span className="relative shrink-0">
          {time}
          {number === undefined ? underline : null}
        </span>
        {/* Data after the time only where it fits whole; the frame's name always says it. */}
        {meta ? <span className="hidden shrink-0 @min-[132px]/label:inline">{meta}</span> : null}
      </span>
    </div>
  );
}

type FrameProps = {
  kind: FrameKind;
  /** The picture the caller renders (`<img alt="">` of a thumbnail or poster). */
  media?: ReactNode;
  number?: number;
  time: string;
  meta?: string;
  /** A text frame's body; clamped to the lines the square holds (3 to 5). */
  text?: string;
  /** The contributor's name under a text frame (admin only). */
  name?: string;
  /** A document's type (`PDF`, `DOCX`), shown in mono violet. */
  docType?: string;
  docTitle?: string;
  /** The one line of a `pending-preview` («Готується прев’ю») or `empty` frame. */
  placeholderLabel?: string;
  isNew?: boolean;
  selected?: boolean;
  /** Selection mode: the frame toggles (`aria-pressed`) instead of opening. */
  selectable?: boolean;
  /** "Кадр 86, фото, 21:10, Ірина[, нове][, вибрано]": everything the picture says, in words. */
  accessibleName: string;
  onOpen?: () => void;
  onToggleSelect?: () => void;
  /** Below the frame's button, e.g. «Повторити» (a full-width 44px button). */
  actions?: ReactNode;
  className?: string;
};

function FrameMedia({
  kind,
  media,
  text,
  name,
  docType,
  docTitle,
  placeholderLabel,
}: Pick<
  FrameProps,
  'kind' | 'media' | 'text' | 'name' | 'docType' | 'docTitle' | 'placeholderLabel'
>) {
  switch (kind) {
    case 'photo':
      return <div className="size-full *:size-full *:object-cover">{media}</div>;
    case 'video':
      return (
        <>
          <div className="size-full bg-muted *:size-full *:object-cover">{media}</div>
          <span className="absolute top-1/2 left-1/2 grid size-9 -translate-1/2 place-items-center rounded-full bg-[rgb(0_0_0/0.55)] text-[#FFFFFF]">
            <Play className="size-4 translate-x-px fill-current" />
          </span>
        </>
      );
    case 'document':
      return (
        <div className="flex size-full flex-col justify-between gap-2 bg-muted p-2">
          <span className="flex items-center gap-1 type-data font-medium text-link">
            <FileText className="size-3.5 shrink-0" />
            {docType}
          </span>
          {docTitle ? (
            <span className="line-clamp-3 type-caption [overflow-wrap:anywhere] text-foreground">
              {docTitle}
            </span>
          ) : null}
        </div>
      );
    case 'text':
      return (
        // As many lines as the square holds (container = the text box): 3 in a 95px phone frame, 4 from
        // about 120px, 5 at 15px from about 150px.
        <div className="@container flex size-full flex-col justify-between gap-1 border border-border bg-card p-2">
          <p className="line-clamp-3 min-h-0 overflow-hidden text-[0.8125rem] leading-snug whitespace-pre-line [overflow-wrap:anywhere] text-foreground @min-[100px]:line-clamp-4 @min-[128px]:line-clamp-5 @min-[128px]:text-[0.9375rem]">
            {text}
          </p>
          {name ? (
            <span className="truncate type-caption text-muted-foreground">{name}</span>
          ) : null}
        </div>
      );
    case 'pending-preview':
      return (
        <div className="grid size-full place-content-center justify-items-center gap-1 bg-muted p-2 text-center text-muted-foreground">
          <ImageIcon className="size-5" />
          {placeholderLabel ? <span className="type-caption">{placeholderLabel}</span> : null}
        </div>
      );
    case 'empty':
      return (
        <div className="grid size-full place-content-center rounded-frame border border-dashed border-input p-2 text-center type-caption text-muted-foreground">
          {placeholderLabel}
        </div>
      );
  }
}

/**
 * One frame of the contact sheet (DESIGN-SYSTEM.md §5.9): a sheet with the media slot (square)
 * and the mono label. A button when it opens (`onOpen`) or toggles (`selectable` +
 * `onToggleSelect`, with `aria-pressed`); otherwise a named group. Lay frames out with
 * `FrameGrid`, which sets their padding (`--frame-pad`).
 */
function Frame({
  kind,
  media,
  number,
  time,
  meta,
  text,
  name,
  docType,
  docTitle,
  placeholderLabel,
  isNew,
  selected = false,
  selectable = false,
  accessibleName,
  onOpen,
  onToggleSelect,
  actions,
  className,
}: FrameProps) {
  const interactive = selectable ? onToggleSelect !== undefined : onOpen !== undefined;
  const body = (
    <>
      <div
        data-slot="frame-media"
        aria-hidden="true"
        className={cn(
          'relative aspect-square w-full overflow-hidden rounded-frame outline-1 -outline-offset-1 outline-transparent transition-[outline-color] duration-(--duration-fast) motion-reduce:transition-none',
          interactive && 'group-hover/frame:outline-input',
        )}
      >
        <FrameMedia
          kind={kind}
          media={media}
          text={text}
          name={name}
          docType={docType}
          docTitle={docTitle}
          placeholderLabel={placeholderLabel}
        />
        {selected ? (
          <span className="absolute top-1 right-1 z-(--z-frame-mark) grid size-5 place-items-center rounded-full bg-[#FFFFFF] text-pencil">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        ) : null}
      </div>
      {/* The frame's accessible name already says all of this. */}
      <div aria-hidden="true" className="min-w-0">
        <FrameLabel number={number} time={time} meta={meta} isNew={isNew} selected={selected} />
      </div>
    </>
  );

  return (
    <div
      data-slot="frame"
      data-kind={kind}
      data-selected={selected ? '' : undefined}
      className={cn(
        'group/frame relative flex min-w-0 flex-col gap-1 bg-card p-(--frame-pad,6px) pb-1',
        selected && 'shadow-[inset_0_0_0_2px_var(--pencil)]',
        className,
      )}
    >
      {interactive ? (
        <button
          type="button"
          aria-label={accessibleName}
          aria-pressed={selectable ? selected : undefined}
          onClick={selectable ? onToggleSelect : onOpen}
          className={cn(
            'grid w-full min-w-0 cursor-pointer touch-manipulation rounded-frame text-left',
            focusRingInset,
          )}
        >
          {body}
        </button>
      ) : (
        <div role="group" aria-label={accessibleName} className="grid w-full min-w-0">
          {body}
        </div>
      )}
      {actions ? <div data-slot="frame-actions">{actions}</div> : null}
    </div>
  );
}

export { Frame, FrameLabel, type FrameKind, type FrameLabelProps, type FrameProps };
