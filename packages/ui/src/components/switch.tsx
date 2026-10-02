import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york): a 40×24 track. Off: a sheet-coloured track with a 1px `--input`
// edge and an `--input` thumb (≥ 3:1 against the card); on: an ink track with a light thumb.
// Wrap it in a `Label` row of min-h-11 so the whole row is the 44px touch target (see the story).
function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-input bg-card transition-[background-color,border-color] duration-(--duration-fast) motion-reduce:transition-none',
        focusRing,
        'hover:border-foreground data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-input transition-transform duration-(--duration-fast) ease-out data-[state=checked]:translate-x-[19px] data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-[3px] motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
