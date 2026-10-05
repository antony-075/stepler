import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { LanguageSwitch } from '@/i18n/language-switch';

/**
 * The plain Stepler header, page column and footer around the guest page's loading and link
 * states. Shared with the editor's preview of those states; nothing here reaches a guest API.
 */
export function GuestChrome({ children }: { children: ReactNode }) {
  return (
    // `viewport-fit=cover` on the guest route: keep clear of the notch and the home indicator.
    <div className="flex min-h-dvh flex-col bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      <SiteHeader>
        <LanguageSwitch variant="header" />
      </SiteHeader>
      <main className="stepler-container flex-1 pt-6 pb-16 sm:pt-10 lg:pt-12">{children}</main>
      <SiteFooter />
    </div>
  );
}
