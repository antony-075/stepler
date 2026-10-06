'use client';

import { GripVertical } from 'lucide-react';
import * as ResizablePrimitive from 'react-resizable-panels';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york-v4) resizable, on react-resizable-panels 4. Restyled for
// direction C: the separator is a 1px `--border` line with a 12px hit area (wider on touch, the
// library's `resizeTargetMinimumSize`), and a small grip pill in its middle so the split reads as
// draggable (`gap`: the handle is the space between two cards, a line appears on hover and focus).
// The separator is a focusable `separator` with `aria-valuenow`: arrows resize, Home and End jump
// to the limits (the library's keyboard support); focus shows violet; the cursor is `col-resize`.

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
  gap = false,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean;
  /**
   * Two separate cards with the page between them (owner remarks 90, 106): the handle is the 16px
   * gap itself, its whole height the hit area with `col-resize`. A 2px line in its middle, 7px
   * from either card, is invisible at rest and fades in on hover (strong neutral) and on keyboard
   * focus or while dragging (violet, the focus state). No grip. No fade under reduced motion.
   */
  gap?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      data-gap={gap || undefined}
      className={cn(
        'group/handle relative flex shrink-0 cursor-col-resize items-center justify-center outline-none',
        gap
          ? [
              'w-4',
              'after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-input after:opacity-0',
              'motion-safe:after:transition-opacity motion-safe:after:duration-(--duration-base)',
              'hover:after:opacity-100 focus-visible:after:bg-ring focus-visible:after:opacity-100 data-[separator=active]:after:bg-ring data-[separator=active]:after:opacity-100',
            ]
          : [
              'w-px bg-border',
              // The hit area, wider than the line.
              'after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2',
              'hover:bg-input data-[separator=active]:bg-input',
              'focus-visible:bg-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid',
            ],
        className,
      )}
      {...props}
    >
      {withHandle && !gap ? (
        <span
          aria-hidden="true"
          className="z-(--z-frame-mark) flex h-8 w-3.5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm group-hover/handle:border-input group-hover/handle:text-foreground group-focus-visible/handle:border-ring group-focus-visible/handle:text-foreground group-data-[separator=active]/handle:border-input"
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
