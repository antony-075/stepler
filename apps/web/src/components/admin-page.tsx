import { cn } from '@stepler/ui/lib/utils';
import type { ReactNode } from 'react';

/**
 * The frame of every admin page (DESIGN-SYSTEM.md §6.0): the shared page column
 * (`stepler-container`) with the same top and bottom space everywhere, so the back link, the h1
 * and the section tabs sit at the same place on every page and switching between them does not
 * move them. Content width follows the content: lists, galleries and link cards use the full
 * column; forms use `AdminFormColumn`, which is narrower but starts at the same left edge.
 */
export function AdminPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn('stepler-container grid gap-8 pt-5 pb-16 lg:pt-8 lg:pb-20', className)}>
      {children}
    </main>
  );
}

/** A form's reading width (640px), left-aligned to the page column: never centred on its own. */
export function AdminFormColumn({ children }: { children: ReactNode }) {
  return <div className="grid w-full max-w-[640px] gap-8">{children}</div>;
}
