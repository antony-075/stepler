'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { Crumb } from './breadcrumbs';

type Setter = (items: Crumb[] | null) => void;

const CrumbsContext = createContext<{ items: Crumb[] | null; set: Setter } | null>(null);

/**
 * The admin top bar's breadcrumbs (owner 2026-10-06): a page with a trail hands it to the shell,
 * which shows it on the left of the desktop top bar; on phones the page keeps its own trail.
 */
export function TopbarCrumbsProvider({ children }: { children: ReactNode }) {
  const [items, set] = useState<Crumb[] | null>(null);
  return <CrumbsContext value={{ items, set }}>{children}</CrumbsContext>;
}

/** The trail the current page handed over, if any. */
export function useTopbarCrumbs(): Crumb[] | null {
  return useContext(CrumbsContext)?.items ?? null;
}

/** Hands `items` to the top bar while the page is shown; takes them back when it leaves. */
export function usePageCrumbs(items: Crumb[]): void {
  const set = useContext(CrumbsContext)?.set;
  // Compared by content, so a new array with the same steps does not set it again.
  const key = JSON.stringify(items);
  useEffect(() => {
    if (set === undefined) return;
    set(JSON.parse(key) as Crumb[]);
    return () => set(null);
  }, [key, set]);
}
