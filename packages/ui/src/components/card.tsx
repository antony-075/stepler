import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

// Based on shadcn/ui (new-york). Deviations: the v4 card surface (20px radius, `shadow-card`),
// padding lives on each section so `CardContent` alone makes a complete single-step card, the
// title is an `h2` by default (`asChild` for another level), and long unbroken text wraps
// instead of widening the card (Review Focus 5).
function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex min-w-0 flex-col rounded-[20px] border bg-card text-card-foreground shadow-card [overflow-wrap:anywhere]',
        className,
      )}
      {...props}
    />
  );
}

// Sections share one padding scale. A section that follows the header starts closer to it; the
// header drops its bottom padding unless it is the only section.
function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('grid gap-1.5 p-5 not-last:pb-0 sm:p-7 lg:p-8', className)}
      {...props}
    />
  );
}

function CardTitle({
  className,
  asChild = false,
  ...props
}: ComponentProps<'h2'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'h2';

  return (
    <Comp
      data-slot="card-title"
      className={cn(
        'font-display text-lg leading-tight font-medium tracking-tight sm:text-xl',
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('p-5 not-last:pb-0 sm:p-7 lg:p-8 [[data-slot=card-header]+&]:pt-4', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex flex-wrap items-center gap-3 p-5 sm:p-7 lg:p-8 [[data-slot]+&]:pt-5',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
