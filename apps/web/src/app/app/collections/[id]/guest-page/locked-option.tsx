'use client';

import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { cn } from '@stepler/ui/lib/utils';
import { type ReactNode, useId } from 'react';

// The editor's choices (plan Task 14, "Locks are shown as text"): one radiogroup per setting
// (`ToggleGroup`: arrows move, Space picks). Owner remarks 72 and 80 (2026-10-05):
// - Text options and pictograms are tiles: a card with a 1px edge, the chosen one with the
//   foreground edge and a soft shadow. A short row (`segments`) shares the width equally; `tiles`
//   is a 2-column grid with pictograms.
// - An option the template does not allow looks the same everywhere: the tile stays in place,
//   dashed and dimmed, focusable and `aria-disabled` (a press does nothing), and the template's
//   reason is a visible line under the group, linked by `aria-describedby`. Never a hover-only
//   tooltip (rule 05).
// - Page backgrounds (owner remark 94) are small samples: the fill with «Аа» in the colour that
//   reads on it and an accent stripe, so dark or pale presets are told apart, and the colour's
//   name under it; the chosen one has a 1px foreground edge around the sample and its name.
// - Accent colours are round swatches: the colour fills the chip (a hairline inside, so white shows on
//   white), the chosen one has a 2px foreground ring 2px outside the colour, the focus ring is the
//   usual violet outline around that. Nothing else in the chip, so it is always centred.

export type Choice<T extends string> = {
  value: T;
  label: string;
  /** Decorative: a pictogram beside the label. */
  icon?: ReactNode;
  /** A swatch's fill: any CSS background (a colour or a gradient). */
  swatch?: string;
  /** `backgrounds`: the text colour that reads on the fill, and the accent, for the sample. */
  sample?: { ink: string; accent: string; text: string };
  /** Not allowed by this template. */
  locked?: boolean;
  /** The accessible name when the item shows no text (a swatch). */
  ariaLabel?: string;
};

// Every variant sets its own height at every pointer and width: the chip's dense 32px (V1, with a
// mouse from `md`) must never squeeze a taller tile, which would then spill over the next row.
const ITEM = {
  segments:
    'h-auto md:pointer-fine:h-auto pointer-coarse:h-auto min-h-11 min-w-0 justify-center border-border bg-card px-3 py-2 text-center leading-tight whitespace-normal text-foreground',
  tiles:
    'h-auto md:pointer-fine:h-auto pointer-coarse:h-auto min-h-14 min-w-0 justify-start gap-2 border-border bg-card px-2.5 py-2 text-left leading-tight whitespace-normal text-foreground',
  // One size for every sample (owner remark 108): the tile fills its column, the name has two
  // lines reserved and is clamped, and the choice is the 1px edge every item already has.
  backgrounds:
    'h-full md:pointer-fine:h-full pointer-coarse:h-full min-w-0 flex-col items-stretch justify-start gap-1 border-transparent bg-transparent p-1 text-center text-xs leading-tight font-medium whitespace-normal text-muted-foreground data-[state=on]:border-foreground data-[state=on]:bg-transparent data-[state=on]:text-foreground aria-checked:border-foreground aria-checked:bg-transparent aria-checked:font-medium aria-checked:text-foreground [&>[data-slot=toggle-group-item-icon]]:block [&>[data-slot=toggle-group-item-label]]:line-clamp-2 [&>[data-slot=toggle-group-item-label]]:min-h-[2.5em] [&>[data-slot=toggle-group-item-label]]:[overflow-wrap:normal]',
  swatches:
    'size-9 md:pointer-fine:size-9 min-w-0 gap-0 rounded-full border-2 border-transparent bg-transparent p-[3px] pointer-coarse:size-11 hover:border-border data-[state=on]:border-foreground data-[state=on]:bg-transparent aria-checked:border-foreground aria-checked:bg-transparent [&>[data-slot=toggle-group-item-icon]]:size-full [&>[data-slot=toggle-group-item-label]]:hidden',
} as const;

const CHOSEN = 'data-[state=on]:border-foreground data-[state=on]:shadow-sm';
const LOCKED =
  'cursor-not-allowed border-dashed border-input bg-transparent text-muted-foreground opacity-60 shadow-none hover:text-muted-foreground';

export function ChoiceGroup<T extends string>({
  label,
  hideLabel = false,
  value,
  choices,
  onChange,
  lockReason,
  readOnly = false,
  variant = 'segments',
  className,
}: {
  label: string;
  hideLabel?: boolean;
  value: T | null;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
  /** The template's reason for its locked choices; shown under the group. */
  lockReason?: string;
  readOnly?: boolean;
  /**
   * `segments`: a row of text tiles; `tiles`: 2 columns with pictograms; `swatches`: colours;
   * `backgrounds`: page backgrounds as small named samples.
   */
  variant?: 'segments' | 'tiles' | 'swatches' | 'backgrounds';
  className?: string;
}) {
  const labelId = useId();
  const reasonId = useId();
  const anyLocked = choices.some((choice) => choice.locked === true);
  const reason = anyLocked ? lockReason : undefined;
  const locked = new Set(choices.filter((c) => c.locked === true).map((c) => c.value));
  return (
    <div className={cn('grid gap-2', className)} data-slot="choice-group">
      <p id={labelId} className={cn('text-sm font-semibold', hideLabel && 'sr-only')}>
        {label}
      </p>
      <ToggleGroup
        aria-labelledby={labelId}
        value={value ?? ''}
        onValueChange={(next) => {
          if (!locked.has(next as T)) onChange(next as T);
        }}
        disabled={readOnly}
        className={cn(
          variant === 'segments' && 'grid w-full auto-cols-fr grid-flow-col gap-2',
          variant === 'tiles' && 'grid w-full grid-cols-2 gap-2',
          variant === 'swatches' && 'flex-wrap gap-1.5',
          variant === 'backgrounds' &&
            // Samples grow with the panel too (remark 114): three per row until 8rem, then more.
            'grid w-full auto-rows-fr grid-cols-[repeat(auto-fill,minmax(clamp(4.5rem,30%,8rem),1fr))] gap-1.5',
        )}
      >
        {choices.map((choice) => {
          const isLocked = choice.locked === true;
          return (
            <ToggleGroupItem
              key={choice.value}
              value={choice.value}
              {...(choice.ariaLabel === undefined ? {} : { 'aria-label': choice.ariaLabel })}
              {...(isLocked
                ? {
                    'aria-disabled': true,
                    'data-locked': true,
                    ...(reason === undefined ? {} : { 'aria-describedby': reasonId }),
                  }
                : {})}
              className={cn(
                ITEM[variant],
                (variant === 'segments' || variant === 'tiles') && CHOSEN,
                isLocked && LOCKED,
              )}
              icon={
                variant === 'backgrounds' && choice.sample !== undefined ? (
                  <BackgroundSample fill={choice.swatch} sample={choice.sample} />
                ) : variant === 'swatches' ? (
                  <span
                    className="block size-full rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.22)]"
                    style={{ background: choice.swatch }}
                  />
                ) : (
                  choice.icon
                )
              }
            >
              {variant === 'swatches' ? null : choice.label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      {reason === undefined ? null : (
        <p
          id={reasonId}
          data-slot="lock-reason"
          className="text-sm text-pretty text-muted-foreground"
        >
          {reason}
        </p>
      )}
    </div>
  );
}

/** A page background in miniature: its fill, a line of text and the accent. Decorative. */
function BackgroundSample({
  fill,
  sample,
}: {
  fill: string | undefined;
  sample: { ink: string; accent: string; text: string };
}) {
  return (
    <span
      className="flex aspect-[4/3] w-full flex-col justify-between rounded-[6px] p-1.5 text-left shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]"
      style={{ background: fill }}
    >
      <span className="text-sm leading-none font-semibold" style={{ color: sample.ink }}>
        {sample.text}
      </span>
      <span className="h-1 w-1/2 rounded-full" style={{ backgroundColor: sample.accent }} />
    </span>
  );
}
