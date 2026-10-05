'use client';

import { LockKeyhole } from 'lucide-react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { type ComponentProps, type MouseEvent, type ReactNode, useId, useState } from 'react';
import { focusHalo } from '../lib/focus';
import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

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
  /**
   * Why the chip can't be chosen («Жодне посилання не дозволяє додавати відео»). The chip then
   * shows a lock, is `aria-disabled` (it stays focusable, so keyboard users reach the reason) with
   * the reason as its description, ignores presses, and shows the reason in a tooltip on hover,
   * focus and tap.
   */
  disabledReason?: string;
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
const itemClassName = cn(
  'group/chip inline-flex h-9 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control border border-transparent px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-[color,border-color] duration-(--duration-fast) pointer-coarse:h-11 motion-reduce:transition-none',
  focusHalo,
  // Selection is read from aria-checked / aria-pressed as well as data-state: a Radix Tooltip
  // trigger (`asChild`) on the item overwrites its data-state with the tooltip's own.
  'data-[state=on]:focus-visible:border-ring aria-checked:focus-visible:border-ring aria-pressed:focus-visible:border-ring',
  'hover:text-foreground data-[state=on]:border-foreground data-[state=on]:bg-card data-[state=on]:text-foreground',
  'aria-checked:border-foreground aria-checked:bg-card aria-checked:text-foreground',
  'aria-pressed:border-foreground aria-pressed:bg-card aria-pressed:text-foreground',
  'disabled:pointer-events-none disabled:text-muted-foreground',
  'aria-disabled:cursor-not-allowed aria-disabled:hover:text-muted-foreground',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
);

function ToggleGroupItem({
  className,
  icon,
  count,
  disabledReason,
  children,
  ...props
}: ToggleGroupItemProps) {
  const body = (
    <>
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
          className="type-data text-muted-foreground group-data-[state=on]/chip:text-foreground group-aria-checked/chip:text-foreground group-aria-pressed/chip:text-foreground"
        >
          {count}
        </span>
      )}
    </>
  );
  if (disabledReason !== undefined) {
    return (
      <LockedToggleGroupItem className={className} reason={disabledReason} {...props}>
        {body}
      </LockedToggleGroupItem>
    );
  }
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(itemClassName, className)}
      {...props}
    >
      {body}
    </ToggleGroupPrimitive.Item>
  );
}

/**
 * A chip that can't be chosen, with its reason. Not `disabled`: Radix would take it out of the
 * focus order and the reason with it. A press is cancelled before Radix sees it (Radix skips its
 * own handler for a prevented event) and opens the tooltip instead, so a tap on touch shows it too.
 */
function LockedToggleGroupItem({
  className,
  reason,
  onClick,
  children,
  ...props
}: Omit<ToggleGroupItemProps, 'icon' | 'count' | 'disabledReason'> & { reason: string }) {
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    event.preventDefault();
    setOpen(true);
  }
  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <ToggleGroupPrimitive.Item
            data-slot="toggle-group-item"
            data-locked=""
            aria-disabled="true"
            aria-describedby={reasonId}
            className={cn(itemClassName, className)}
            onClick={handleClick}
            {...props}
          >
            <LockKeyhole aria-hidden="true" className="size-3.5" />
            {children}
          </ToggleGroupPrimitive.Item>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
      {/* The description, outside the chip so it is not part of its name. */}
      <span id={reasonId} hidden>
        {reason}
      </span>
    </TooltipProvider>
  );
}

export { ToggleGroup, ToggleGroupItem, type ToggleGroupItemProps, type ToggleGroupProps };
