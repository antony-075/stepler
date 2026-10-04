import { cva } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

// Based on shadcn/ui (new-york). Deviations: four variants on direction C soft fills (a 4px
// sheet, no edge), a built-in icon per variant, an optional `action` row, and the live-region
// role chosen by variant (`alert` only for errors, so info and success are announced politely).
// Body text stays `foreground` on every variant (≥ 15:1 on each fill); colour lives in the fill
// and the icon (success 4.93 / 7.51, warning 4.80 / 8.03, error 6.23 / 7.37, info violet
// 6.39 / 7.31 on their fills), so it is never the only signal.
const alertVariants = cva(
  'grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-sheet p-4 text-sm leading-[1.45] text-foreground [overflow-wrap:anywhere]',
  {
    variants: {
      variant: {
        info: 'bg-info-soft',
        success: 'bg-success-soft',
        warning: 'bg-warning-soft',
        error: 'bg-destructive-soft',
      },
    },
  },
);

const ICONS: Record<AlertVariant, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: 'text-link' },
  success: { icon: CircleCheck, className: 'text-success' },
  warning: { icon: TriangleAlert, className: 'text-warning' },
  error: { icon: CircleAlert, className: 'text-destructive' },
};

type AlertProps = {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  /** A follow-up control (e.g. a Retry button), shown under the text. */
  action?: ReactNode;
  /** Overrides the live-region role: `note` for a static notice that is part of the page. */
  role?: 'alert' | 'status' | 'note';
  className?: string;
};

function Alert({ variant = 'info', title, children, action, className, role }: AlertProps) {
  const { icon: Icon, className: iconClassName } = ICONS[variant];

  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role={role ?? (variant === 'error' ? 'alert' : 'status')}
      className={cn(alertVariants({ variant }), className)}
    >
      <Icon aria-hidden="true" className={cn('size-5 shrink-0', iconClassName)} />
      <div className="grid min-w-0 gap-1">
        {title ? (
          <p data-slot="alert-title" className="font-semibold">
            {title}
          </p>
        ) : null}
        {children ? <div data-slot="alert-description">{children}</div> : null}
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
