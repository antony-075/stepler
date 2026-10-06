// Frame: one contribution as a tile of the photo grid (DESIGN-SYSTEM.md §5.9, §5.10, §5.13).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - Owner decision 2026-10-04 (remark 62): borderless tiles, as in Google Photos or iCloud,
//   instead of the contact sheet's shared lines and white cells. A square with an 8px radius; a
//   photo or video fills it edge to edge (`object-cover` on the 480px thumbnail); `FrameGrid`
//   puts 6/8px gaps between tiles and no panel behind them.
// - Meta sits on the picture, always visible (never on hover): the number (`#086`, Geist Mono)
//   as a small dark pill at the bottom-left over a soft scrim, and for a video `▶ 0:12` beside
//   it. The time is not on the tile (the viewer and the accessible name carry it), so the grid
//   stays calm; the admin's contributor name is only on wish tiles.
// - A wish is a sand card (the DS tint) with a quiet quote mark, large text clamped to the
//   square, and the number and name (admin) at the bottom. A document is a lavender card: the
//   type in mono violet, the file name in two lines, the size and number at the bottom.
//   «Готується прев’ю» and failures are a neutral square with an icon and one short line.
// - One interactive target per tile (a button: open, or toggle in selection mode with
//   `aria-pressed`), named by the caller ("Кадр 86, фото, 21:10, Ірина"); the picture is
//   aria-hidden. Actions (e.g. «Повторити») sit below it, never inside the button.
// - Selection is never colour alone (V1): the picture steps back to 90% on the soft accent, an
//   accent disc with ✓ pops in at the top-right (an empty white circle on every tile while
//   selecting), and `aria-pressed`.
//   Focus is the violet ring outside the tile. Hover lifts the picture slightly (scale 1.03),
//   not under reduced motion.
// - Long content never widens the tile: text clamps, titles break anywhere.
import { Check, FileText, ImageIcon, Play, Quote } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { focusRing } from '../lib/focus';
import { formatFrameNumber } from '../lib/frame-number';
import { cn } from '../lib/utils';
import { PencilMark } from './pencil-mark';

type FrameKind = 'photo' | 'video' | 'document' | 'text' | 'pending-preview' | 'empty';

type FrameProps = {
  kind: FrameKind;
  /** The picture the caller renders (`<img alt="">` of a thumbnail or poster). */
  media?: ReactNode;
  /** Rendered as `#086`; omit it where the viewer may not see numbers (other guests' frames). */
  number?: number;
  /** A video's duration (in the pill after ▶), or a document's size (at the card's bottom). */
  meta?: string;
  /** A text frame's body; clamped to the lines the square holds. */
  text?: string;
  /** The contributor's name at the bottom of a wish (admin only). */
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
  /** "Кадр 86, фото, 21:10, Ірина[, нове][, вибрано]": everything the tile says, in words. */
  accessibleName: string;
  onOpen?: () => void;
  /** Gets the click, so the caller can read Shift for a range. */
  onToggleSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Below the frame's button, e.g. «Повторити» (a full-width 44px button). */
  actions?: ReactNode;
  /**
   * Quick actions over the tile's top-right corner (the admin's «Завантажити», «Видалити»):
   * shown on hover and keyboard focus with a mouse (hidden otherwise, also from screen readers
   * and the Tab order until the tile has focus), never on touch screens (no hover there), so
   * they must also be reachable another way (the viewer, selection mode). Not in selection mode.
   */
  overlay?: ReactNode;
  /** A 1px inner edge over the picture, so a white photo keeps its outline on a white page. */
  outlined?: boolean;
  className?: string;
};

/** The dark pill over a picture: white mono text, legible on any photo in both themes. */
const PILL =
  'inline-flex h-5 items-center gap-1 rounded-[4px] bg-[rgb(24_24_27/0.66)] px-1.5 type-data text-[0.75rem] leading-none font-medium text-[#FFFFFF]';

/** The number with its "new" underline, in the pill or on a card. */
function FrameNumber({
  number,
  isNew,
  className,
}: {
  number: number;
  isNew?: boolean | undefined;
  className?: string;
}) {
  return (
    <span data-slot="frame-number" translate="no" className={cn('relative shrink-0', className)}>
      {formatFrameNumber(number)}
      {isNew ? (
        <PencilMark
          variant="underline"
          seed={number}
          className="absolute inset-x-0 -bottom-1 h-1.5 w-full"
        />
      ) : null}
    </span>
  );
}

/** Number and duration pills at the bottom-left of a tile. */
function Pills({
  number,
  duration,
  isNew,
}: {
  number?: number | undefined;
  duration?: string | undefined;
  isNew?: boolean | undefined;
}) {
  if (number === undefined && !duration) return null;
  return (
    <span className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] gap-1">
      {number === undefined ? null : (
        <span className={PILL}>
          <FrameNumber number={number} isNew={isNew} />
        </span>
      )}
      {duration ? (
        <span className={PILL}>
          <Play className="size-2.5 fill-current" />
          {duration}
        </span>
      ) : null}
    </span>
  );
}

function FrameFace({
  kind,
  media,
  number,
  meta,
  text,
  name,
  docType,
  docTitle,
  placeholderLabel,
  isNew,
}: Pick<
  FrameProps,
  | 'kind'
  | 'media'
  | 'number'
  | 'meta'
  | 'text'
  | 'name'
  | 'docType'
  | 'docTitle'
  | 'placeholderLabel'
  | 'isNew'
>) {
  switch (kind) {
    case 'photo':
    case 'video': {
      const duration = kind === 'video' ? meta : undefined;
      return (
        <>
          <div
            data-slot="frame-picture"
            className="size-full bg-muted *:size-full *:object-cover motion-safe:transition-transform motion-safe:duration-(--duration-base) motion-safe:ease-out motion-safe:group-hover/frame:scale-[1.03]"
          >
            {media}
          </div>
          {/* A video without a poster is ▶ on grey (D4). */}
          {kind === 'video' && media === undefined ? (
            <span className="absolute top-1/2 left-1/2 grid size-9 -translate-1/2 place-items-center rounded-full bg-[rgb(0_0_0/0.55)] text-[#FFFFFF]">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
          ) : null}
          {number === undefined && !duration ? null : (
            // A soft scrim under the pills, so they read on a white wedding dress too.
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-[rgb(0_0_0/0.35)] to-transparent" />
          )}
          <Pills number={number} duration={duration} isNew={isNew} />
        </>
      );
    }
    case 'document':
      return (
        <div className="@container flex size-full flex-col gap-1.5 bg-tint-lavender p-2 @min-[150px]:p-3">
          <span className="flex items-center gap-1 type-data font-medium text-tint-lavender-ink">
            <FileText className="size-3.5 shrink-0" />
            <span translate="no">{docType}</span>
          </span>
          {docTitle ? (
            <span className="line-clamp-2 type-caption [overflow-wrap:anywhere] text-foreground @min-[150px]:text-sm">
              {docTitle}
            </span>
          ) : null}
          <span className="mt-auto flex min-w-0 items-baseline gap-2 type-data text-[0.75rem] text-tint-lavender-ink">
            {number === undefined ? null : (
              <FrameNumber number={number} isNew={isNew} className="font-medium" />
            )}
            {meta ? <span className="ml-auto truncate">{meta}</span> : null}
          </span>
        </div>
      );
    case 'text':
      return (
        // The words on a sand card; type grows with the square (container = the card): 13px and
        // 4 lines in a phone tile, 15px from 128px, 16px with 5 lines from 168px.
        <div className="@container flex size-full flex-col gap-1 bg-tint-sand p-2 @min-[168px]:gap-1.5 @min-[168px]:p-3">
          <Quote aria-hidden="true" className="size-3.5 shrink-0 text-tint-sand-ink" />
          <p className="line-clamp-4 min-h-0 overflow-hidden text-[0.8125rem] leading-snug text-pretty whitespace-pre-line [overflow-wrap:anywhere] text-foreground @min-[128px]:text-[0.9375rem] @min-[168px]:line-clamp-5 @min-[168px]:text-base @min-[168px]:leading-[1.4]">
            {text}
          </p>
          {number === undefined && !name ? null : (
            <span className="mt-auto flex min-w-0 items-baseline gap-2 type-data text-[0.75rem] text-tint-sand-ink">
              {number === undefined ? null : (
                <FrameNumber number={number} isNew={isNew} className="font-medium" />
              )}
              {name ? <span className="min-w-0 truncate font-sans">{name}</span> : null}
            </span>
          )}
        </div>
      );
    case 'pending-preview':
      return (
        <>
          <div className="grid size-full place-content-center justify-items-center gap-1 bg-muted p-2 pb-8 text-center text-muted-foreground">
            <ImageIcon className="size-5" />
            {placeholderLabel ? <span className="type-caption">{placeholderLabel}</span> : null}
          </div>
          <Pills number={number} duration={meta} isNew={isNew} />
        </>
      );
    case 'empty':
      return (
        <div className="grid size-full place-content-center rounded-control border border-dashed border-input p-2 text-center type-caption text-muted-foreground">
          {placeholderLabel}
        </div>
      );
  }
}

/**
 * One tile of the photo grid (DESIGN-SYSTEM.md §5.9): a square with the picture (or a wish or
 * document card) and its number on it. A button when it opens (`onOpen`) or toggles
 * (`selectable` + `onToggleSelect`, with `aria-pressed`); otherwise a named group. Lay tiles out
 * with `FrameGrid`.
 */
function Frame({
  kind,
  media,
  number,
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
  overlay,
  outlined = false,
  className,
}: FrameProps) {
  const interactive = selectable ? onToggleSelect !== undefined : onOpen !== undefined;
  const tile = (
    <div
      data-slot="frame-media"
      aria-hidden="true"
      className={cn(
        'relative aspect-square w-full rounded-frame',
        selected ? 'bg-info-soft' : 'bg-transparent',
      )}
    >
      {/* Selected, the picture steps back to 90% (V1): the tile's soft accent shows around it. */}
      <div
        data-slot="frame-face"
        className={cn(
          'absolute inset-0 overflow-hidden rounded-frame transition-transform duration-(--duration-menu) ease-out motion-reduce:transition-none',
          kind === 'empty' ? 'bg-transparent' : 'bg-muted',
          selected && 'scale-90 rounded-control',
        )}
      >
        <FrameFace
          kind={kind}
          media={media}
          number={number}
          meta={meta}
          text={text}
          name={name}
          docType={docType}
          docTitle={docTitle}
          placeholderLabel={placeholderLabel}
          isNew={isNew}
        />
      </div>
      {outlined ? (
        <span
          data-slot="frame-edge"
          className="pointer-events-none absolute inset-0 z-(--z-frame-mark) rounded-frame shadow-[inset_0_0_0_1px_var(--border)]"
        />
      ) : null}
      {selected ? (
        <span className="absolute top-1.5 right-1.5 z-(--z-frame-mark) grid size-[1.375rem] place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_2px_#FFFFFF] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 motion-safe:animation-duration-[var(--duration-fast)]">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : selectable ? (
        // In selection mode every tile shows its empty check (never hover-only, §5.13).
        <span
          data-slot="frame-check"
          className="absolute top-1.5 right-1.5 z-(--z-frame-mark) size-[1.375rem] rounded-full border-[1.5px] border-[rgb(24_24_27/0.45)] bg-[rgb(255_255_255/0.85)]"
        />
      ) : null}
    </div>
  );

  return (
    <div
      data-slot="frame"
      data-kind={kind}
      data-selected={selected ? '' : undefined}
      className={cn('group/frame relative flex min-w-0 flex-col gap-1.5', className)}
    >
      {interactive ? (
        <button
          type="button"
          aria-label={accessibleName}
          aria-pressed={selectable ? selected : undefined}
          onClick={selectable ? onToggleSelect : onOpen}
          className={cn(
            'block w-full min-w-0 cursor-pointer touch-manipulation rounded-frame text-left',
            focusRing,
          )}
        >
          {tile}
        </button>
      ) : (
        <div role="group" aria-label={accessibleName} className="w-full min-w-0">
          {tile}
        </div>
      )}
      {overlay && !selectable ? (
        <div
          data-slot="frame-overlay"
          className="invisible absolute top-1.5 right-1.5 z-(--z-frame-mark) flex gap-1 opacity-0 transition-[opacity,visibility] duration-(--duration-fast) group-focus-within/frame:visible group-focus-within/frame:opacity-100 group-hover/frame:visible group-hover/frame:opacity-100 motion-reduce:transition-none [@media(hover:none)]:hidden"
        >
          {overlay}
        </div>
      ) : null}
      {actions ? <div data-slot="frame-actions">{actions}</div> : null}
    </div>
  );
}

export { Frame, type FrameKind, type FrameProps };
