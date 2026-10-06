import { cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

// Based on shadcn/ui (new-york), restyled for V1 (DESIGN-SYSTEM.md §0.5): a 22px status tag,
// a soft tinted fill with text in the status colour and a 6px dot (owner feedback 2026-10-02: a
// dot alone did not say which colour the status was). A 5px radius, not a pill. Every text-on-fill pair passes 4.5:1 in both
// themes (DESIGN-SYSTEM.md §2.2). No `asChild`: a badge is status text, never a control. Long text
// truncates to one line; pass the full text as `title`.
const badgeVariants = cva(
  'inline-flex h-[1.375rem] max-w-full min-w-0 items-center gap-1.5 rounded-[5px] px-2 align-middle text-xs leading-[1.4] font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-foreground-soft',
        info: 'bg-info-soft text-link',
        success: 'bg-success-soft text-success [&>[data-slot=badge-dot]]:bg-success-dot',
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
      <span
        aria-hidden="true"
        data-slot="badge-dot"
        className="size-1.5 shrink-0 rounded-full bg-current"
      />
      <span data-slot="badge-text" className="min-w-0 truncate">
        {children}
      </span>
    </span>
  );
}

export { Badge, type BadgeProps, type BadgeVariant };
