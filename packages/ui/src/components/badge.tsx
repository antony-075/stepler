import { cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

// Based on shadcn/ui (new-york), restyled for direction C (DESIGN-SYSTEM.md §5.8): a status tag,
// a soft tinted fill with text in the status colour and a 6px dot of the same colour. Owner
// feedback 2026-10-02: a dot alone did not say which colour the status was. Radius 4 like a
// sheet, not a pill (the system has no pills). Every text-on-fill pair passes 4.5:1 in both
// themes (DESIGN-SYSTEM.md §2.2). No `asChild`: a badge is status text, never a control. Long text
// truncates to one line; pass the full text as `title`.
const badgeVariants = cva(
  'inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-sheet px-2 align-middle text-[0.8125rem] leading-[1.4] font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground',
        info: 'bg-info-soft text-link',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-destructive-soft text-destructive',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

type BadgeProps = ComponentProps<'span'> & { variant?: BadgeVariant };

function Badge({ variant = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span data-slot="badge-text" className="min-w-0 truncate">
        {children}
      </span>
    </span>
  );
}

export { Badge, type BadgeProps, type BadgeVariant };
