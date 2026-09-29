import type { ReactNode } from 'react';
import { AppShell } from './app-shell';

/** The admin area. Session checks happen in the API; the shell only redirects on 401. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
