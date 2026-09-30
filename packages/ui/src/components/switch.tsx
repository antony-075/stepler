import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york), enlarged to a 24px track. Wrap it in a `Label` row of min-h-11 so
// the whole row is the 44px touch target (see the story). The unchecked track uses `--input`
// (≥ 3:1 against the card).
function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-[background-color,box-shadow] outline-none motion-reduce:transition-none',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-card shadow-sm ring-0 transition-transform duration-200 data-[state=checked]:translate-x-[calc(100%-4px)] data-[state=unchecked]:translate-x-0.5 motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
