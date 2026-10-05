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
// - Colours are round swatches: the colour fills the chip (a hairline inside, so white shows on
//   white), the chosen one has a 2px foreground ring 2px outside the colour, the focus ring is the
//   usual violet outline around that. Nothing else in the chip, so it is always centred.

export type Choice<T extends string> = {
  value: T;
  label: string;
  /** Decorative: a pictogram beside the label. */
  icon?: ReactNode;
  /** A swatch's fill: any CSS background (a colour or a gradient). */
  swatch?: string;
  /** Not allowed by this template. */
  locked?: boolean;
  /** The accessible name when the item shows no text (a swatch). */
  ariaLabel?: string;
};

const ITEM = {
  segments:
    'h-auto min-h-11 min-w-0 justify-center border-border bg-card px-3 py-2 text-center leading-tight whitespace-normal text-foreground',
  tiles:
    'h-auto min-h-14 min-w-0 justify-start gap-2 border-border bg-card px-2.5 py-2 text-left leading-tight whitespace-normal text-foreground',
  swatches:
    'size-9 min-w-0 gap-0 rounded-full border-2 border-transparent bg-transparent p-[3px] pointer-coarse:size-11 hover:border-border data-[state=on]:border-foreground data-[state=on]:bg-transparent [&>[data-slot=toggle-group-item-icon]]:size-full [&>[data-slot=toggle-group-item-label]]:hidden',
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
  /** `segments`: a row of text tiles; `tiles`: 2 columns with pictograms; `swatches`: colours. */
  variant?: 'segments' | 'tiles' | 'swatches';
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
              className={cn(ITEM[variant], variant !== 'swatches' && CHOSEN, isLocked && LOCKED)}
              icon={
                variant === 'swatches' ? (
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
