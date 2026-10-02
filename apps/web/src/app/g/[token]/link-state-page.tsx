import type { ReactNode } from 'react';

/**
 * The guest's full-page link state (DESIGN-SYSTEM.md §6.10): one h1, one line, a button only when
 * there is something to do. `tone="warning"` puts a warning dot before the title (paused); the
 * words carry the meaning, the dot is decoration.
 */
export function LinkStatePage({
  title,
  text,
  tone,
  action,
}: {
  title: string;
  text?: string;
  tone?: 'warning';
  action?: ReactNode;
}) {
  return (
    <section data-slot="link-state" className="grid justify-items-start gap-3">
      <h1 className="type-h1 [overflow-wrap:anywhere]">
        {/* Inline, so it sits on the first line however the title wraps. */}
        {tone === 'warning' ? (
          <span
            aria-hidden="true"
            className="mr-3 inline-block size-3 -translate-y-1 rounded-full bg-warning align-middle"
          />
        ) : null}
        {title}
      </h1>
      {text === undefined ? null : (
        <p className="max-w-[44ch] text-pretty text-muted-foreground">{text}</p>
      )}
      {action === undefined ? null : <div className="mt-3 w-full sm:w-auto">{action}</div>}
    </section>
  );
}
