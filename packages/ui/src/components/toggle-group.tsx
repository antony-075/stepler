'use client';

import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { cn } from '../lib/utils';

type ToggleGroupProps = Omit<ToggleGroupPrimitive.ToggleGroupSingleProps, 'type'>;

/**
 * Single-select segmented control (the theme and language settings). Radix renders
 * it as a `radiogroup` of `radio` items: arrows move focus, Space or Enter selects. Name it with
 * `aria-label` or `aria-labelledby`.
 *
 * Deviation from Radix: a segmented control always has a value, so pressing the selected item
 * does not clear it (`onValueChange` is never called with an empty string).
 */
function ToggleGroup({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: ToggleGroupProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '');
  const currentValue = value ?? uncontrolledValue;

  function handleValueChange(next: string) {
    if (next === '') return;
    if (value === undefined) setUncontrolledValue(next);
    onValueChange?.(next);
  }

  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      type="single"
      value={currentValue}
      onValueChange={handleValueChange}
      // A recessed well: the page colour with an inset hairline, so it reads on a card in both
      // themes without a grey fill.
      className={cn(
        'inline-flex w-fit items-center rounded-lg bg-control-track shadow-[inset_0_0_0_1px_var(--border)]',
        className,
      )}
      {...props}
    />
  );
}

type ToggleGroupItemProps = ComponentProps<typeof ToggleGroupPrimitive.Item> & {
  /** Decorative icon shown before the label; it is hidden from assistive technology. */
  icon?: ReactNode;
};

/**
 * Each item is a full 44px touch target (rule 05); the raised thumb is drawn 3px inside it
 * (`before:`), lighter than the card in both themes, and the selected icon turns primary. Other
 * props (`lang`, `title`, …) pass through to the Radix item.
 *
 * Keep the visible text in the accessible name (WCAG 2.5.3 Label in Name): do not give a
 * text item an `aria-label` that drops what is on screen. For a language the visible name is
 * the accessible name and `lang` tells screen readers how to say it:
 * `<ToggleGroupItem value="uk" lang="uk">Українська</ToggleGroupItem>`.
 */
function ToggleGroupItem({ className, icon, children, ...props }: ToggleGroupItemProps) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        'relative isolate inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors outline-none motion-reduce:transition-none',
        "before:absolute before:inset-[3px] before:-z-10 before:rounded-[9px] before:content-[''] before:transition-[background-color,box-shadow] motion-reduce:before:transition-none",
        'hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/70',
        'data-[state=on]:text-foreground data-[state=on]:before:bg-control-thumb data-[state=on]:before:shadow-[var(--shadow-thumb),0_0_0_1px_color-mix(in_srgb,var(--foreground)_10%,transparent)]',

        'disabled:pointer-events-none disabled:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span data-slot="toggle-group-item-icon" aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      ) : null}
      <span data-slot="toggle-group-item-label">{children}</span>
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem, type ToggleGroupItemProps, type ToggleGroupProps };
