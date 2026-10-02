import { Label as LabelPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york): 14px/600 above the field. Deviation: a label wrapping or
// preceding a disabled control turns muted (readable, not half-transparent).
function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-[1.45] font-semibold text-foreground select-none',
        'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground',
        // A label wrapping its control (Checkbox/Switch rows) turns muted when it is disabled.
        'has-disabled:cursor-not-allowed has-disabled:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
