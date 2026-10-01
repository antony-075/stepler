import { cva } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

// Based on shadcn/ui (new-york). Deviations: four variants on the v4 tokens, a built-in icon per
// variant, an optional `action` row, and the live-region role chosen by variant (`alert` only for
// errors, so info and success are announced politely). Body text stays `foreground` on every
// variant so it keeps full contrast; colour lives in the edge, the tint and the icon.
const alertVariants = cva(
  'grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-lg border p-4 text-sm text-card-foreground [overflow-wrap:anywhere]',
  {
    variants: {
      variant: {
        info: 'border-border bg-card',
        success: 'border-success/40 bg-success-soft',
        warning: 'border-accent-warm bg-accent-warm/10',
        error: 'border-destructive/50 bg-destructive/10',
      },
    },
  },
);

// `accent-warm` is too light for a line icon on a light card, so the warning triangle is filled
// with it and drawn in `accent-warm-foreground` (readable in both themes).
const ICONS: Record<AlertVariant, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'text-primary' },
  success: { icon: CircleCheck, className: 'text-success' },
  warning: { icon: TriangleAlert, className: 'fill-accent-warm text-accent-warm-foreground' },
  error: { icon: CircleAlert, className: 'text-destructive' },
};

type AlertProps = {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  /** A follow-up control (e.g. a Retry button), shown under the text. */
  action?: ReactNode;
  className?: string;
};

function Alert({ variant = 'info', title, children, action, className }: AlertProps) {
  const { icon: Icon, className: iconClassName } = ICONS[variant];

  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
    >
      <Icon aria-hidden="true" className={cn('mt-px size-5 shrink-0', iconClassName)} />
      <div className="grid min-w-0 gap-1">
        {title ? (
          <p data-slot="alert-title" className="leading-5 font-bold">
            {title}
          </p>
        ) : null}
        {children ? (
          <div
            data-slot="alert-description"
            className={cn('leading-5', { 'text-muted-foreground': Boolean(title) })}
          >
            {children}
          </div>
        ) : null}
        {action ? (
          <div data-slot="alert-action" className="mt-2 flex flex-wrap gap-2">
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { Alert, type AlertProps, type AlertVariant };
