'use client';

import { Info } from 'lucide-react';
import { useState } from 'react';
import { focusRing } from '../lib/focus';
import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

/**
 * A static hint as an info icon beside a label (DESIGN-SYSTEM.md §5; owner remark 79,
 * 2026-10-05): for help that is nice to know, never for what the person must know to proceed
 * (errors and lock reasons stay visible text). A real button: the hint shows on hover, on keyboard
 * focus and on a tap (touch has no hover), and Escape closes it. The hint text is also the
 * button's accessible name, so a screen reader hears it without opening anything. A 16px icon in
 * a 44px target.
 */
export function InfoTip({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-slot="info-tip"
            onClick={(event) => {
              // A tap opens it (and keeps it open); hover and focus are Radix's own.
              event.preventDefault();
              setOpen(true);
            }}
            className={cn(
              // A 44px target around a 16px icon; the negative margin keeps the line's rhythm.
              '-m-3 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground',
              focusRing,
              className,
            )}
          >
            <Info aria-hidden="true" className="size-4" />
            <span className="sr-only">{text}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-pretty">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
