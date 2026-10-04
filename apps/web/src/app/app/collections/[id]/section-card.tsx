import type { ReactNode } from 'react';

/**
 * A numbered section card: the number (the order of the page, `aria-hidden`), the h2 and a
 * muted hint on the right from `md`, then the content.
 */
export function SectionCard({
  number,
  id,
  title,
  hint,
  children,
}: {
  number?: number;
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-5 rounded-sheet border bg-card p-4 shadow-card sm:p-6"
    >
      <div className="grid gap-x-6 gap-y-1 md:grid-cols-[auto_minmax(0,1fr)] md:items-baseline">
        <h2 id={id} className="type-h3 flex items-center gap-3">
          {number === undefined ? null : (
            <span
              aria-hidden="true"
              className="type-data grid size-7 shrink-0 place-items-center rounded-full border bg-background text-foreground"
            >
              {number}
            </span>
          )}
          {title}
        </h2>
        {hint ? (
          <p className="text-sm text-pretty text-muted-foreground md:text-right">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
