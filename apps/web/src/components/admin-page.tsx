import { cn } from '@stepler/ui/lib/utils';
import type { ReactNode } from 'react';

/**
 * The frame of every admin page (DESIGN-SYSTEM.md §6.0): the shared fluid page column
 * (`admin-container`, inside the area right of the sidebar from `lg`) with the same top space
 * everywhere (`--page-top`, set by the shell and shared with the sidebar's nav) and bottom space, so the back link, the h1 and the section tabs sit at the same place
 * on every page and switching between them does not move them. Every page uses the full column
 * (owner review 2026-10-02). `#main` is the skip link's target.
 */
export function AdminPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className={cn(
        'admin-container grid grid-cols-[minmax(0,1fr)] content-start gap-5 pt-(--page-top) pb-16 outline-none laptop:gap-4',
        className,
      )}
    >
      {children}
    </main>
  );
}
