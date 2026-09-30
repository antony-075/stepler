import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york). Vertical by default.
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
        'flex min-h-11 cursor-pointer items-center gap-3 py-2 text-base font-medium has-disabled:cursor-not-allowed has-disabled:text-muted-foreground',
        className,
      )}
    >
      <RadioGroupPrimitive.Item
        data-slot="radio-group-item"
        className={cn(
          'peer aspect-square size-5 shrink-0 rounded-full border border-input bg-card shadow-xs transition-[border-color,box-shadow] outline-none motion-reduce:transition-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'data-[state=checked]:border-primary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        )}
        {...props}
      >
        <RadioGroupPrimitive.Indicator
          data-slot="radio-group-indicator"
          className="flex items-center justify-center"
        >
          <span className="size-2.5 rounded-full bg-primary" />
        </RadioGroupPrimitive.Indicator>
      </RadioGroupPrimitive.Item>
      <span className="min-w-0">{children}</span>
    </label>
  );
}

export { RadioGroup, RadioGroupItem };
