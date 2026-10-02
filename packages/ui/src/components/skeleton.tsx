import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york). Direction C: a still `--muted` shape with the frame radius, no
// pulse or shimmer (DESIGN-SYSTEM.md §5.16), so there is nothing to stop under reduced motion.
// Hidden from assistive technology: the region that is loading announces it (`aria-busy` plus a
// visually hidden "Loading…").
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('rounded-frame bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
