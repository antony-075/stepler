'use client';

import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { cn } from '@stepler/ui/lib/utils';
import { type ReactNode, useId } from 'react';

// The editor's choices (plan Task 14, "Locks are shown as text"): one segmented control per
// setting (`ToggleGroup`: a radiogroup, arrows move, Space picks). An option the template does
// not allow stays in place, focusable and `aria-disabled`, with a dashed edge and a lock, and the
// template's reason is a visible line under the group, linked by `aria-describedby`. Never a
// hover-only tooltip (rule 05; the artboard's «Цей шаблон не підтримує» is replaced).

export type Choice<T extends string> = {
  value: T;
  label: string;
  /** Decorative: a pictogram or a swatch. */
  icon?: ReactNode;
  /** Not allowed by this template. */
  locked?: boolean;
  /** The accessible name when the item shows no text (a swatch). */
  ariaLabel?: string;
};

const ITEM = {
  segments: 'flex-1 data-[state=on]:shadow-sm',
  tiles:
    'h-auto min-h-14 min-w-0 justify-start gap-2 border-input bg-card px-2.5 py-2 text-left leading-tight whitespace-normal data-[state=on]:border-foreground',
  swatches:
    'size-9 min-w-0 rounded-full border-2 border-transparent p-0 pointer-coarse:size-11 data-[state=on]:border-foreground',
} as const;

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
  /** `segments`: text options; `tiles`: 2 columns of pictograms; `swatches`: colour chips. */
  variant?: 'segments' | 'tiles' | 'swatches';
  className?: string;
}) {
  const labelId = useId();
  const reasonId = useId();
  const anyLocked = choices.some((choice) => choice.locked === true);
  const reason = anyLocked ? lockReason : undefined;
  return (
    <div className={cn('grid gap-2', className)} data-slot="choice-group">
      <p id={labelId} className={cn('text-sm font-semibold', hideLabel && 'sr-only')}>
        {label}
      </p>
      <ToggleGroup
        aria-labelledby={labelId}
        {...(reason === undefined ? {} : { 'aria-describedby': reasonId })}
        value={value ?? ''}
        onValueChange={(next) => onChange(next as T)}
        disabled={readOnly}
        className={cn(
          variant === 'segments' && 'w-full flex-wrap rounded-control bg-muted p-1',
          variant === 'tiles' && 'grid w-full grid-cols-2 gap-2',
          variant === 'swatches' && 'flex-wrap gap-2',
        )}
      >
        {choices.map((choice) => (
          <ToggleGroupItem
            key={choice.value}
            value={choice.value}
            {...(choice.ariaLabel === undefined ? {} : { 'aria-label': choice.ariaLabel })}
            {...(choice.locked === true && reason !== undefined ? { disabledReason: reason } : {})}
            {...(choice.locked === true ? { 'data-locked': true } : {})}
            className={cn(ITEM[variant], {
              'border-dashed border-input opacity-70': choice.locked === true,
            })}
            icon={choice.icon}
          >
            {variant === 'swatches' ? null : choice.label}
          </ToggleGroupItem>
        ))}
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

/** A section of the panel: an h2 and its body, separated by a hairline from the next. */
export function EditorSection({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: string;
  /** Shown on phones in the accordion row; ignored here. */
  summary?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      data-slot="editor-section"
      data-summary={summary}
      className="grid gap-4 border-b px-6 py-5 last:border-b-0"
    >
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
