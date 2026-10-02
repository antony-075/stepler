import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type EmptyStateProps = {
  /**
   * The number of the frame that will come first, drawn as an empty dashed frame (`#001`): the
   * invitation of a contact sheet waiting for its first frame. Decorative; omit it for an
   * empty filter result.
   */
  frameNumber?: number;
  title: ReactNode;
  description?: ReactNode;
  /** The next step, usually a Button. */
  action?: ReactNode;
  /** Match the page outline: 2 under the page `h1`, 3 inside a titled section. */
  headingLevel?: 2 | 3;
  className?: string;
};

/** `#` and at least three digits (`#001`); four from 1000 (DESIGN-SYSTEM.md §3.4). */
function formatFrameNumber(value: number): string {
  return `#${String(value).padStart(3, '0')}`;
}

// Direction C (DESIGN-SYSTEM.md §5.16): an empty frame instead of an icon in a circle, then a
// panel heading, one line and the next step.
function EmptyState({
  frameNumber,
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
        'mx-auto grid w-full max-w-md justify-items-center gap-2 px-4 py-10 text-center [overflow-wrap:anywhere]',
        className,
      )}
    >
      {frameNumber === undefined ? null : (
        <div data-slot="empty-state-frame" aria-hidden="true" className="mb-1 grid w-24 gap-1">
          <div className="aspect-square rounded-frame border border-dashed border-input" />
          <span className="type-data text-left text-muted-foreground" translate="no">
            {formatFrameNumber(frameNumber)}
          </span>
        </div>
      )}
      <Heading data-slot="empty-state-title" className="type-h3">
        {title}
      </Heading>
      {description ? (
        <p data-slot="empty-state-description" className="max-w-[44ch] text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? (
        <div data-slot="empty-state-action" className="mt-2 flex flex-wrap justify-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export { EmptyState, formatFrameNumber, type EmptyStateProps };
