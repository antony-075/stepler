import { cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

// Based on shadcn/ui (new-york), restyled for direction C (DESIGN-SYSTEM.md §5.8): a status is
// a 6px dot plus 13px text, with no fill and no edge. The text is `foreground`, so it reads on
// any surface; the dot carries the colour and never stands alone. No `asChild`: a badge is
// status text, never a control. Long text truncates to one line; pass the full text as `title`.
const badgeVariants = cva(
  'inline-flex max-w-full min-w-0 items-center gap-1.5 align-middle text-[0.8125rem] leading-[1.4] font-medium whitespace-nowrap text-foreground',
);

const DOT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-muted-foreground',
  info: 'bg-link',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
};

type BadgeProps = ComponentProps<'span'> & { variant?: BadgeVariant };

function Badge({ variant = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants(), className)}
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
