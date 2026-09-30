import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type PageHeaderProps = {
  /** The page's only `h1`. */
  title: ReactNode;
  description?: ReactNode;
  /** Page-level actions, usually Buttons: under the title on phones, on its right from `sm`. */
  actions?: ReactNode;
  /** An optional link above the title (e.g. back to the list). */
  back?: ReactNode;
  className?: string;
};

function PageHeader({ title, description, actions, back, className }: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn('grid gap-4 sm:flex sm:items-end sm:justify-between sm:gap-6', className)}
    >
      <div className="grid min-w-0 gap-2">
        {back ? (
          <div data-slot="page-header-back" className="-mt-2 justify-self-start">
            {back}
          </div>
        ) : null}
        <h1 className="font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] leading-tight font-medium tracking-tight [overflow-wrap:anywhere]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-prose text-muted-foreground [overflow-wrap:anywhere]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div data-slot="page-header-actions" className="flex shrink-0 flex-wrap gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export { PageHeader, type PageHeaderProps };
