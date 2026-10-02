import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york). Vertical by default; the checked dot is ink.
function RadioGroup({
  className,
  orientation = 'vertical',
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      orientation={orientation}
      className={cn('grid gap-1', className)}
      {...props}
    />
  );
}

// Deviation from shadcn: an item is a full-row label (min 44px, rule 05) holding the radio and
// its `children`, so the whole row is the touch target and the children are its accessible name.
// Disabled text uses the muted colour rather than opacity so it keeps readable contrast.
function RadioGroupItem({
  className,
  children,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <label
      data-slot="radio-group-item-label"
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-3 py-2 text-base has-disabled:cursor-not-allowed has-disabled:text-muted-foreground',
        className,
      )}
    >
      <RadioGroupPrimitive.Item
        data-slot="radio-group-item"
        className={cn(
          'aspect-square size-5 shrink-0 rounded-full border border-input bg-card transition-[border-color] duration-(--duration-fast) motion-reduce:transition-none',
          focusRing,
          'hover:border-foreground data-[state=checked]:border-primary',
          'disabled:cursor-not-allowed disabled:bg-muted',
          'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive',
        )}
        {...props}
      >
        <RadioGroupPrimitive.Indicator
          data-slot="radio-group-indicator"
          className="flex items-center justify-center"
        >
          <span className="size-2.5 rounded-full bg-primary [[data-disabled]_&]:bg-muted-foreground" />
        </RadioGroupPrimitive.Indicator>
      </RadioGroupPrimitive.Item>
      <span className="min-w-0">{children}</span>
    </label>
  );
}

export { RadioGroup, RadioGroupItem };
