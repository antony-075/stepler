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
  /**
   * `default`: the display title of public and guest pages (32 / 44 / 64px). `compact`: the admin
   * h1 (28 / 32 / 44px).
   */
  size?: 'default' | 'compact';
  className?: string;
};

const TITLE_SIZE = {
  default: 'type-display',
  compact: 'type-h1',
} as const;

function PageHeader({
  title,
  description,
  actions,
  back,
  size = 'default',
  className,
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn('grid gap-4 sm:flex sm:items-end sm:justify-between sm:gap-6', className)}
    >
      {/* `minmax(0,1fr)` and the back slot's `max-w-full`: a long back link (a collection title)
          can truncate instead of widening the page. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {back ? (
          <div data-slot="page-header-back" className="max-w-full justify-self-start">
            {back}
          </div>
        ) : null}
        <h1
          data-slot="page-header-title"
          data-size={size}
          className={cn('[overflow-wrap:anywhere]', TITLE_SIZE[size])}
        >
          {title}
        </h1>
        {description ? (
          <p
            data-slot="page-header-description"
            className="max-w-[60ch] text-muted-foreground [overflow-wrap:anywhere]"
          >
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
