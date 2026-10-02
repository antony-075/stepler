import { cn } from '@stepler/ui/lib/utils';
import type { ReactNode } from 'react';

/**
 * The frame of every admin page (DESIGN-SYSTEM.md §6.0): the shared page column
 * (`stepler-container`) with the same top and bottom space everywhere, so the back link, the h1
 * and the section tabs sit at the same place on every page and switching between them does not
 * move them. Every page uses the full column (owner review 2026-10-02); settings pages split
 * it into a heading column and a panel column from `lg` (`SettingsSection`).
 */
export function AdminPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn('stepler-container grid gap-8 pt-5 pb-16 lg:pt-8 lg:pb-20', className)}>
      {children}
    </main>
  );
}
