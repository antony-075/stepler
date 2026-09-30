'use client';

import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { cn } from '../lib/utils';

type ToggleGroupProps = Omit<ToggleGroupPrimitive.ToggleGroupSingleProps, 'type'>;

/**
 * Single-select segmented control (the v4 header's theme and language switches). Radix renders
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
      className={cn(
        'inline-flex w-fit items-center gap-0.5 rounded-full bg-muted p-0.5',
        className,
      )}
      {...props}
    />
  );
}

type ToggleGroupItemProps = ComponentProps<typeof ToggleGroupPrimitive.Item> & {
  /** Decorative icon shown before the label; it is hidden from assistive technology. */
  icon?: ReactNode;
  /**
   * Visually hides the label (it still names the item): `always`, or `phone` below `sm`, where
   * the icon alone shows. Only use it together with `icon`.
   */
  hideLabel?: 'always' | 'phone';
};

/**
 * Items are at least 44×44px (rule 05). Other props (`lang`, `title`, …) pass through to the
 * Radix item.
 *
 * Keep the visible text in the accessible name (WCAG 2.5.3 Label in Name): do not give a
 * text item an `aria-label` that drops what is on screen. For the language switch the visible
 * short label ("UA") is the name, `lang` tells screen readers how to say it, and `title`
 * carries the full language name:
 * `<ToggleGroupItem value="uk" lang="uk" title="Українська">UA</ToggleGroupItem>`.
 * Icon items name themselves with their (visually hidden) label via `hideLabel`.
 */
function ToggleGroupItem({ className, icon, hideLabel, children, ...props }: ToggleGroupItemProps) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        'inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-[0.8125rem] font-semibold whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] outline-none motion-reduce:transition-none sm:px-3',
        'hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/70',
        'data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm',
        'disabled:pointer-events-none disabled:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span data-slot="toggle-group-item-icon" aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      ) : null}
      <span
        data-slot="toggle-group-item-label"
        className={cn({
          'sr-only': hideLabel === 'always',
          'max-sm:sr-only': hideLabel === 'phone',
        })}
      >
        {children}
      </span>
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem, type ToggleGroupItemProps, type ToggleGroupProps };
