'use client';

import { GripVertical } from 'lucide-react';
import * as ResizablePrimitive from 'react-resizable-panels';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york-v4) resizable, on react-resizable-panels 4. Restyled for
// direction C: the separator is a 1px `--border` line with a 12px hit area (wider on touch, the
// library's `resizeTargetMinimumSize`), and a small grip pill in its middle so the split reads as
// draggable. The separator is a focusable `separator` with `aria-valuenow`: arrows resize, Home
// and End jump to the limits (the library's keyboard support); focus shows the violet ring.

function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full aria-[orientation=vertical]:flex-col', className)}
      {...props}
    />
  );
}

function ResizablePanel(props: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle = false,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & { withHandle?: boolean }) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        'group/handle relative flex w-px shrink-0 items-center justify-center bg-border outline-none',
        // The hit area, wider than the line.
        'after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2',
        'hover:bg-input data-[separator=active]:bg-input',
        'focus-visible:bg-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid',
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <span
          aria-hidden="true"
          className="z-(--z-frame-mark) flex h-8 w-3.5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm group-hover/handle:text-foreground group-focus-visible/handle:border-ring group-focus-visible/handle:text-foreground"
        >
          <GripVertical className="size-3" />
        </span>
      ) : null}
    </ResizablePrimitive.Separator>
  );
}

/** Remembers a group's layout between visits (pass a storage that never throws). */
const useDefaultLayout = ResizablePrimitive.useDefaultLayout;

export { ResizableHandle, ResizablePanel, ResizablePanelGroup, useDefaultLayout };
