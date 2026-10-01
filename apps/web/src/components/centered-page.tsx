import { Card, CardContent } from '@stepler/ui/components/card';
import type { ReactNode } from 'react';
import { SiteHeader } from './site-header';

/**
 * Header + one card on the page atmosphere, centred horizontally and top-aligned like the
 * sign-in card on /login (a vertically centred card jumps when its content changes height); for
 * verify and similar single steps.
 */
export function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <div className="stepler-atmosphere flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="stepler-container flex-1 pt-2 pb-16 sm:pt-6 lg:pt-12">
        <Card className="mx-auto w-full max-w-md">
          <CardContent>{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
