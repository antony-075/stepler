/**
 * The dashboard's «Таблиця / Плитки» choice (owner 2026-10-06), remembered per browser in
 * localStorage. Storage can be missing or throw (private windows, blocked site data): reading
 * then gives the default and writing does nothing, and the page works the same.
 */
export type DashboardView = 'table' | 'tiles';

export const DASHBOARD_VIEWS: readonly DashboardView[] = ['table', 'tiles'];
export const DEFAULT_DASHBOARD_VIEW: DashboardView = 'table';
export const DASHBOARD_VIEW_KEY = 'stepler:dashboard-view';

type ViewStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The remembered view, or the default when there is none, it is unknown or storage fails. */
export function readDashboardView(storage: () => ViewStorage | null): DashboardView {
  try {
    const value = storage()?.getItem(DASHBOARD_VIEW_KEY);
    return DASHBOARD_VIEWS.find((view) => view === value) ?? DEFAULT_DASHBOARD_VIEW;
  } catch {
    return DEFAULT_DASHBOARD_VIEW;
  }
}

/** Remembers `view`; a storage that throws is ignored. */
export function writeDashboardView(storage: () => ViewStorage | null, view: DashboardView): void {
  try {
    storage()?.setItem(DASHBOARD_VIEW_KEY, view);
  } catch {
    // Not remembered this time.
  }
}

/** The browser's localStorage; reading the property itself can throw. */
export const browserStorage = (): ViewStorage | null =>
  typeof window === 'undefined' ? null : window.localStorage;
