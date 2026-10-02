import { Panel, PanelContent } from '@stepler/ui/components/panel';
import type { ReactNode } from 'react';
import { SiteHeader } from './site-header';

/**
 * Header + one panel on the light table, centred horizontally and top-aligned like the sign-in
 * panel on /login (a vertically centred panel jumps when its content changes height); for verify
 * and similar single steps.
 */
export function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="stepler-container flex-1 pt-4 pb-16 sm:pt-8 lg:pt-16">
        <Panel className="mx-auto w-full max-w-md">
          <PanelContent>{children}</PanelContent>
        </Panel>
      </main>
    </div>
  );
}
