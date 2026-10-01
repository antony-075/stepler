import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york). Hidden from assistive technology: the region that is loading
// announces it (e.g. a Spinner or `aria-busy`). The pulse stops under reduced motion.
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

export { Skeleton };
