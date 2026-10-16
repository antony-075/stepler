'use client';

// The console's shared page pieces (owner remark 2026-10-16: «табы унифицированы»), so every
// section reads the same way: the header, the tabs and the filter bar.
// - `OpsPageHeader`: the h1 (24px, 600, tight), one muted line under it, actions at its end;
// - `OpsTabs`: the one tab row of the console, for a queue's statuses and billing's pages alike.
//   Links (each tab is a URL the operator can reload or share): an underline row, the current
//   one in the text colour with a 2px bar and weight, `aria-current="page"`; 44px on touch,
//   40px from `md`; wraps on phones instead of scrolling sideways;
// - `OpsFilterBar`: the filters of a list as one `role="search"` form on a white panel; the
//   section lays out its fields with `className` (a grid from `md`).
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';

export function OpsPageHeader({
  id,
  title,
  description,
  actions,
}: {
  /** The h1's id, which names the section (`aria-labelledby`). */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="grid max-w-3xl gap-1">
        <h1 id={id} className="text-[1.5rem] leading-tight font-semibold tracking-[-0.015em]">
          {title}
        </h1>
        {description === undefined ? null : (
          <p className="text-[0.9375rem] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions === undefined ? null : <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export type OpsTab = { key: string; href: string; label: ReactNode; current: boolean };

const PAGE = 'page';
const TAB_CURRENT = 'border-foreground font-semibold text-foreground';
const TAB_OTHER = 'border-transparent text-muted-foreground hover:text-foreground';

export function OpsTabs({
  label,
  tabs,
  replace = false,
}: {
  label: string;
  tabs: readonly OpsTab[];
  /** A filter of the same page (a queue's status): the tab replaces the history entry. */
  replace?: boolean;
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-x-6 border-b border-border-strong">
        {tabs.map((tab) => (
          <li key={tab.key} className="-mb-px">
            <Link
              href={tab.href}
              replace={replace}
              scroll={!replace}
              aria-current={tab.current ? PAGE : undefined}
              className={cn(
                'inline-flex min-h-11 items-center border-b-2 text-[0.9375rem] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring md:min-h-10',
                tab.current ? TAB_CURRENT : TAB_OTHER,
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function OpsFilterBar({
  label,
  onSubmit,
  className,
  children,
}: {
  label: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      role="search"
      aria-label={label}
      noValidate
      onSubmit={onSubmit}
      className={cn('grid gap-3 rounded-sheet border bg-card p-4', className)}
    >
      {children}
    </form>
  );
}
