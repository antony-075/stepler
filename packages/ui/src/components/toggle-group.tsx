'use client';

import { LockKeyhole } from 'lucide-react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import {
  Children,
  type ComponentProps,
  createContext,
  isValidElement,
  type MouseEvent,
  type ReactNode,
  useContext,
  useId,
  useState,
} from 'react';
import { focusHalo, focusRingInset } from '../lib/focus';
import { cn } from '../lib/utils';
import { SegmentThumb } from './segment-thumb';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

/** Separates the label and the count in the accessible name; flex layout does not render it. */
const NAME_SPACE = ' ';

type ToggleGroupVariant = 'chips' | 'segmented' | 'pill';

type ToggleGroupProps = Omit<ToggleGroupPrimitive.ToggleGroupSingleProps, 'type'> & {
  /**
   * `chips` (default): separate bordered chips, the selected one on the soft accent.
   * `segmented`: equal segments on a grey track with a white thumb that slides to the selected
   * one (CSS only: the thumb moves by its own width, so the segments are equal).
   * `pill`: a rounded grey track, each item as wide as its words, the selected one a white pill
   * with a soft shadow (the billing page's «Щомісяця / Щороку» and «₴ / $ / €»).
   */
  variant?: ToggleGroupVariant;
};

const VariantContext = createContext<ToggleGroupVariant>('chips');

/** The `value` of each direct item child, in order (for the sliding thumb). */
function itemValues(children: ReactNode): string[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement<{ value?: unknown }>(child) && typeof child.props.value === 'string'
      ? [child.props.value]
      : [],
  );
}

/**
 * Single-select filter chips or a segmented control (DESIGN-SYSTEM.md §0.5). Radix renders it as
 * a `radiogroup` of `radio` items: arrows move focus, Space or Enter selects. Name it with
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
  variant = 'chips',
  children,
  ...props
}: ToggleGroupProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '');
  const currentValue = value ?? uncontrolledValue;

  function handleValueChange(next: string) {
    if (next === '') return;
    if (value === undefined) setUncontrolledValue(next);
    onValueChange?.(next);
  }

  const values = variant === 'segmented' ? itemValues(children) : [];
  return (
    <VariantContext value={variant}>
      <ToggleGroupPrimitive.Root
        data-slot="toggle-group"
        data-variant={variant}
        type="single"
        value={currentValue}
        onValueChange={handleValueChange}
        className={cn(
          variant === 'segmented'
            ? 'relative isolate inline-grid w-fit max-w-full auto-cols-fr grid-flow-col rounded-[7px] bg-track p-0.5 shadow-[inset_0_0_0_1px_var(--track-edge)]'
            : variant === 'pill'
              ? 'inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-muted p-1 shadow-[inset_0_0_0_1px_var(--track-edge)]'
              : 'inline-flex w-fit max-w-full items-center gap-1.5',
          className,
        )}
        {...props}
      >
        {variant === 'segmented' ? <SegmentThumb count={values.length} /> : null}
        {children}
      </ToggleGroupPrimitive.Root>
    </VariantContext>
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
 * A filter chip (DESIGN-SYSTEM.md §0.5): 36px (32px with a mouse from `md`), 44px on touch
 * (`pointer-coarse`), a 6px radius and a quiet edge; the selected chip sits on the soft accent
 * with accent text (selection is also `aria-checked` and the weight, never colour alone). In a
 * `segmented` group the item is a segment over the track.
 * Other props (`lang`, `title`, …) pass through to the Radix item.
 *
 * Keep the visible text in the accessible name (WCAG 2.5.3 Label in Name): do not give a
 * text item an `aria-label` that drops what is on screen. A `count` renders after the label in
 * mono (`Фото 98`) and is read with it. For a language the visible name is the accessible name
 * and `lang` tells screen readers how to say it:
 * `<ToggleGroupItem value="uk" lang="uk">Українська</ToggleGroupItem>`.
 */
const itemClassName = cn(
  'group/chip inline-flex h-9 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control border border-border-strong bg-card px-2.5 text-sm whitespace-nowrap text-foreground-soft transition-[color,background-color,border-color,transform] duration-(--duration-fast) ease-out active:scale-[0.97] md:pointer-fine:h-8 pointer-coarse:h-11 motion-reduce:transition-none motion-reduce:active:scale-100',
  focusHalo,
  // Selection is read from aria-checked / aria-pressed as well as data-state: a Radix Tooltip
  // trigger (`asChild`) on the item overwrites its data-state with the tooltip's own.
  'hover:border-input hover:text-foreground',
  'data-[state=on]:border-[color-mix(in_srgb,var(--ring)_35%,transparent)] data-[state=on]:bg-info-soft data-[state=on]:font-semibold data-[state=on]:text-link',
  'aria-checked:border-[color-mix(in_srgb,var(--ring)_35%,transparent)] aria-checked:bg-info-soft aria-checked:font-semibold aria-checked:text-link',
  'aria-pressed:border-[color-mix(in_srgb,var(--ring)_35%,transparent)] aria-pressed:bg-info-soft aria-pressed:font-semibold aria-pressed:text-link',
  'data-[state=on]:focus-visible:border-ring aria-checked:focus-visible:border-ring aria-pressed:focus-visible:border-ring',
  'disabled:pointer-events-none disabled:text-muted-foreground',
  'aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground aria-disabled:hover:border-border-strong aria-disabled:hover:text-muted-foreground aria-disabled:active:scale-100',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
);

/** A segment: transparent over the track; the thumb behind it shows which one is chosen. */
const segmentClassName = cn(
  'group/chip relative z-1 inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-[5px] px-3 text-sm whitespace-nowrap text-foreground-soft transition-colors duration-(--duration-fast) md:pointer-fine:h-8 pointer-coarse:h-11 motion-reduce:transition-none',
  focusRingInset,
  'hover:text-foreground aria-checked:font-semibold aria-checked:text-foreground',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-muted-foreground",
);

/** A pill: transparent on the track; the selected one is white with a soft shadow. */
const pillClassName = cn(
  'group/chip inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-full px-4.5 text-[0.9375rem] whitespace-nowrap text-foreground-soft transition-[color,background-color,box-shadow] duration-(--duration-fast) motion-reduce:transition-none',
  focusRingInset,
  'hover:text-foreground aria-checked:bg-card aria-checked:font-semibold aria-checked:text-foreground aria-checked:shadow-[0_1px_3px_rgb(0_0_0/0.12)]',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
);

const ITEM_CLASS: Record<ToggleGroupVariant, string> = {
  chips: itemClassName,
  segmented: segmentClassName,
  pill: pillClassName,
};

function ToggleGroupItem({
  className,
  icon,
  count,
  disabledReason,
  children,
  ...props
}: ToggleGroupItemProps) {
  const variant = useContext(VariantContext);
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
          className="type-data text-muted-foreground group-data-[state=on]/chip:text-current group-aria-checked/chip:text-current group-aria-pressed/chip:text-current"
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
      className={cn(ITEM_CLASS[variant], className)}
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

export {
  ToggleGroup,
  ToggleGroupItem,
  type ToggleGroupItemProps,
  type ToggleGroupProps,
  type ToggleGroupVariant,
};
