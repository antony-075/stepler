import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSessionUser } from '@/api/server';
import { AppShell } from './app-shell';
import { isSidebarCollapsed, SIDEBAR_COOKIE } from './sidebar-state';

/**
 * The admin area. A signed-out visitor is sent to /login on the server, before any of the shell
 * renders. If the API can't answer, the shell renders and shows its own error and retry; it also
 * still redirects on a 401 later on (the session can expire while the page is open).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if ((await getSessionUser()) === null) redirect('/login');
  const collapsed = isSidebarCollapsed((await cookies()).get(SIDEBAR_COOKIE)?.value);
  return <AppShell initialCollapsed={collapsed}>{children}</AppShell>;
}
