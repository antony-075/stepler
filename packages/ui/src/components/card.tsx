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
        'flex min-w-0 flex-col rounded-[20px] border bg-card text-card-foreground shadow-card',
        className,
      )}
      {...props}
    />
  );
}

// Sections share one padding scale. A section that follows the header starts closer to it, and
// a header or content section drops its bottom padding only when another card section follows
// (so a Separator or any other sibling keeps the full padding, and `className` still wins).
// Text wraps long unbroken strings instead of widening the card (Review Focus 5): the title, the
// description and paragraphs inside content. It is not set on the root or on content itself, so
// flex rows and form controls inside keep their normal min-content sizing.
const BEFORE_SECTION = '[&:has(+[data-slot=card-content],+[data-slot=card-footer])]:pb-0';

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('grid gap-1.5 p-5 sm:p-7 lg:p-8', BEFORE_SECTION, className)}
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
        'font-display text-lg leading-tight font-medium tracking-tight [overflow-wrap:anywhere] sm:text-xl',
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
      className={cn('text-sm text-muted-foreground [overflow-wrap:anywhere]', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        'p-5 sm:p-7 lg:p-8 [[data-slot=card-header]+&]:pt-4 [&_p]:[overflow-wrap:anywhere]',
        BEFORE_SECTION,
        className,
      )}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex flex-wrap items-center gap-3 p-5 sm:p-7 lg:p-8 [[data-slot^=card-]+&]:pt-5',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
