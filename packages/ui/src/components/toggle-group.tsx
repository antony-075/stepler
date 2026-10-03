'use client';

import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';

/** Separates the label and the count in the accessible name; flex layout does not render it. */
const NAME_SPACE = ' ';

type ToggleGroupProps = Omit<ToggleGroupPrimitive.ToggleGroupSingleProps, 'type'>;

/**
 * Single-select filter chips (direction C's FilterChips: content type, grid or rows). Radix renders
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
      className={cn('inline-flex w-fit max-w-full items-center gap-1', className)}
      {...props}
    />
  );
}

type ToggleGroupItemProps = ComponentProps<typeof ToggleGroupPrimitive.Item> & {
  /** Decorative icon shown before the label; it is hidden from assistive technology. */
  icon?: ReactNode;
  /** A count after the label, in mono (`Фото 98`); part of the accessible name. */
  count?: ReactNode;
};

/**
 * A filter chip (DESIGN-SYSTEM.md §5.7): 36px for a fine pointer, 44px on touch
 * (`pointer-coarse`), 8px radius, muted text; the selected chip has a 1px `--foreground` edge on
 * the sheet colour (selection is also `aria-checked` and the text colour, never colour alone).
 * Other props (`lang`, `title`, …) pass through to the Radix item.
 *
 * Keep the visible text in the accessible name (WCAG 2.5.3 Label in Name): do not give a
 * text item an `aria-label` that drops what is on screen. A `count` renders after the label in
 * mono (`Фото 98`) and is read with it. For a language the visible name is the accessible name
 * and `lang` tells screen readers how to say it:
 * `<ToggleGroupItem value="uk" lang="uk">Українська</ToggleGroupItem>`.
 */
function ToggleGroupItem({ className, icon, count, children, ...props }: ToggleGroupItemProps) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        'group/chip inline-flex h-9 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control border border-transparent px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-[color,border-color] duration-(--duration-fast) pointer-coarse:h-11 motion-reduce:transition-none',
        focusRing,
        'hover:text-foreground data-[state=on]:border-foreground data-[state=on]:bg-card data-[state=on]:text-foreground',
        'disabled:pointer-events-none disabled:text-muted-foreground',
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
      {count === undefined || count === null ? null : NAME_SPACE}
      {count === undefined || count === null ? null : (
        <span
          data-slot="toggle-group-item-count"
          className="type-data text-muted-foreground group-data-[state=on]/chip:text-foreground"
        >
          {count}
        </span>
      )}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem, type ToggleGroupItemProps, type ToggleGroupProps };
