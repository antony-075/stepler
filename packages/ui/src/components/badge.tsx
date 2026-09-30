import { cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

// Based on shadcn/ui (new-york). Deviations: status variants on the v4 tokens instead of
// default/secondary/destructive/outline, a decorative status dot, and no `asChild`: a badge is
// status text, never a control. `success` and `destructive` text on their own tints falls just
// under 4.5:1 at 12px in light, so those variants keep `foreground` text and carry the colour
// in the tint, edge and dot (as Alert does). Long text truncates to one line; the caller
// passes the full text as `title`.
const badgeVariants = cva(
  'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2 py-0.5 align-middle text-xs leading-4 font-bold whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-secondary text-secondary-foreground',
        info: 'border-primary/25 bg-primary/10 text-primary',
        success: 'border-success/40 bg-success-soft text-foreground',
        warning: 'border-accent-warm bg-accent-warm text-accent-warm-foreground',
        danger: 'border-destructive/40 bg-destructive/10 text-foreground',
      },
    },
  },
);

const DOT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-muted-foreground',
  info: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-accent-warm-foreground',
  danger: 'bg-destructive',
};

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
        className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASSES[variant])}
      />
      <span data-slot="badge-text" className="min-w-0 truncate">
        {children}
      </span>
    </span>
  );
}

export { Badge, type BadgeProps, type BadgeVariant };
