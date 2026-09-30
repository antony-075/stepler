import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type EmptyStateProps = {
  /** A lucide icon element; it is decorative. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** The next step, usually a Button. */
  action?: ReactNode;
  /** Match the page outline: 2 under the page `h1`, 3 inside a titled section. */
  headingLevel?: 2 | 3;
  className?: string;
};

function EmptyState({
  icon,
  title,
  description,
  action,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  return (
    <div
      data-slot="empty-state"
      className={cn(
        'mx-auto grid w-full max-w-md justify-items-center gap-3 px-4 py-10 text-center [overflow-wrap:anywhere]',
        className,
      )}
    >
      {icon ? (
        <div
          data-slot="empty-state-icon"
          aria-hidden="true"
          className="mb-1 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-6"
        >
          {icon}
        </div>
      ) : null}
      <Heading className="font-display text-lg leading-tight font-medium tracking-tight">
        {title}
      </Heading>
      {description ? <p className="text-muted-foreground">{description}</p> : null}
      {action ? (
        <div data-slot="empty-state-action" className="mt-2 flex flex-wrap justify-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export { EmptyState, type EmptyStateProps };
