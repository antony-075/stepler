'use client';

import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { popoverSurfaceClassName } from '../lib/surfaces';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york) popover, on the menus' surface (DESIGN-SYSTEM.md §5): a small
// panel of controls anchored to a button (the editor's collapsed preview toolbar, remark 107).
// Radix: Escape and an outside press close it, focus moves in and returns to the trigger.

function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = 'end',
  sideOffset = 6,
  collisionPadding = 16,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          popoverSurfaceClassName,
          'max-w-[calc(100vw-2rem)] origin-(--radix-popover-content-transform-origin) p-3 outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
