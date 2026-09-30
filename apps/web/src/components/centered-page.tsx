import type { ReactNode } from 'react';
import { SiteHeader } from './site-header';

/** Header + one centred card on the page atmosphere; for verify and similar single steps. */
export function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <div className="stepler-atmosphere flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="grid flex-1 place-items-center px-4 pt-4 pb-16">
        <div className="w-full max-w-md rounded-[20px] border bg-card p-5 shadow-card sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
