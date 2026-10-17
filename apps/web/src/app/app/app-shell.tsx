'use client';

import { Button } from '@stepler/ui/components/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@stepler/ui/components/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@stepler/ui/components/tooltip';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { isApiError } from '@/api/client';
import { fetchMe, ME_QUERY_KEY } from '@/api/me';
import { errorMessageKey } from '@/errors/error-message';
import { setLocaleCookie } from '@/i18n/set-locale';
import { BrandLoading } from '@/components/brand-loading';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { TopbarCrumbsProvider, useTopbarCrumbs } from '@/components/topbar-crumbs';
import { AccessBanner } from './access-banner';
import { AccountBlock } from './account-block';
import { AdminNav } from './admin-nav';
import { sidebarCookie } from './sidebar-state';

export function AppShell({
  initialCollapsed,
  children,
}: {
  /** The desktop sidebar folded to a rail, from the `st_sidebar` cookie. */
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe });
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = sidebarCookie(next, { secure: window.location.protocol === 'https:' });
  };

  // ADR 0011: the profile locale comes before the cookie. The server only sees the cookie, so
  // when the profile disagrees (set on another device) the cookie follows it and the page is
  // re-rendered. Checked once per visit: later changes come from this tab's own switch, which
  // updates the profile itself, and a failed save must not bounce the page back.
  const localeChecked = useRef(false);
  const profileLocale = me.data?.locale;
  useEffect(() => {
    if (profileLocale === undefined || localeChecked.current) return;
    localeChecked.current = true;
    if (profileLocale === locale) return;
    setLocaleCookie(profileLocale);
    router.refresh();
  }, [profileLocale, locale, router]);

  const unauthenticated = isApiError(me.error, 'UNAUTHENTICATED');
  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  // A forced re-acceptance (ADR 0016) can arrive while the app is open: the next `me` says so.
  const legalPending = me.data?.legal.accepted === false;
  useEffect(() => {
    if (legalPending) router.replace('/accept-terms');
  }, [legalPending, router]);

  if (me.data === undefined) {
    const failed = me.error !== null && !unauthenticated;
    const failure = isApiError(me.error) ? me.error.code : 'INTERNAL';
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-4">
        {failed ? (
          <div className="grid max-w-sm justify-items-center gap-4 text-center">
            <p role="alert" className="text-pretty">
              {t(errorMessageKey(failure))}
            </p>
            <Button onClick={() => void me.refetch()}>{t('verify.retry')}</Button>
          </div>
        ) : (
          <BrandLoading label={t('app.loading')} />
        )}
      </main>
    );
  }

  // V1 «Графіт» (owner 2026-10-06; DESIGN-SYSTEM.md §0.7), on the decisions of 2026-10-02: from
  // `lg` a left sidebar on the grey chrome with the wordmark, «Колекції» and «Акаунт» under it
  // and the legal links at the bottom; it folds to a 72px icon rail (the toggle at its top,
  // remembered per browser). The content is one white panel with a 1px edge, 8px from the window,
  // with a slim 48px top bar (who is signed in, «Вийти») that stays at the top while the page
  // scrolls. Below `lg` the same nav is a sheet behind a menu button in a 56px bar.
  return (
    <TopbarCrumbsProvider>
      <TooltipProvider>
        <div
          data-sidebar={collapsed ? 'collapsed' : 'expanded'}
          className={cn(
            'min-h-dvh bg-background lg:grid lg:transition-[grid-template-columns] lg:duration-(--duration-base) lg:ease-out motion-reduce:lg:transition-none',
            // The space above a page's first line (its h1, or the collection's mini-nav), shared by
            // the page (AdminPage) and the sidebar's nav, so «Колекції» sits on the h1's line.
            '[--page-top:1.25rem] lg:[--page-top:1.5rem] laptop:[--page-top:1.25rem]',
            // The collection's mini-nav runs edge to edge: no cap for it or the top bar above it.
            'has-[[data-page-top=tight]]:[--admin-max:none]',
            collapsed
              ? 'lg:grid-cols-[4.5rem_minmax(0,1fr)]'
              : 'lg:grid-cols-[14rem_minmax(0,1fr)]',
          )}
        >
          <a
            href="#main"
            className={cn(
              'sr-only z-(--z-skip) rounded-control bg-primary px-4 py-3 font-semibold text-primary-foreground no-underline focus:not-sr-only focus:fixed focus:top-2 focus:left-2',
              focusRing,
            )}
          >
            {t('app.skipToContent')}
          </a>
          <aside
            id="admin-sidebar"
            className="sticky top-0 hidden h-dvh min-w-0 flex-col overflow-hidden lg:flex"
          >
            <div
              // The panel's top bar: 8px from the window, 50px tall; this row shares its centre line.
              className={cn(
                'mt-2 flex h-[3.125rem] shrink-0 items-center gap-2',
                collapsed ? 'justify-center px-3' : 'pr-2 pl-4',
              )}
            >
              {/* Folded (owner 2026-10-06): no logo, only «Розгорнути меню» on this line. */}
              {collapsed ? null : <BrandLink />}
              <SidebarToggle collapsed={collapsed} onToggle={toggleSidebar} />
            </div>
            {/* The nav starts where the page's first line does (--page-top under the top bar); its
              36px row is 5px taller than the h1's line, so it starts 2.5px higher to share the
              h1's centre line. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 pt-[calc(var(--page-top)-2.5px)] pb-4">
              <AdminNav collapsed={collapsed} />
            </div>
          </aside>
          {/* The white panel; on `lg` the window's 8px margin stays visible around it. */}
          <div className="flex min-h-dvh min-w-0 flex-col lg:py-2 lg:pr-2 [--shell-inset-bottom:0px] lg:[--shell-inset-bottom:9px]">
            {/* Covers the 8px above the stuck top bar, so content never shows over it. */}
            <div
              aria-hidden="true"
              className="pointer-events-none sticky top-0 z-(--z-sticky) -mt-2 hidden h-2 bg-background lg:block"
            />
            <div
              data-slot="admin-panel"
              className="flex min-w-0 flex-1 flex-col bg-background lg:rounded-sheet lg:border lg:bg-card"
            >
              <header className="sticky top-0 z-(--z-sticky) border-b bg-background lg:top-2 lg:-mx-px lg:-mt-px lg:rounded-t-sheet lg:border lg:bg-card">
                <div className="admin-container flex h-14 items-center gap-2 lg:h-12">
                  <MobileNav />
                  {/* Desktop: where the page sits (owner 2026-10-06); phones keep it in the page. */}
                  <div className="hidden min-w-0 flex-1 lg:flex">
                    <TopbarTrail />
                  </div>
                  <div className="ml-auto flex min-w-0 justify-end">
                    <AccountBlock email={me.data.email} displayName={me.data.displayName} />
                  </div>
                </div>
              </header>
              <div className="flex-1">
                <ShellAccessBanner />
                {children}
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </TopbarCrumbsProvider>
  );
}

/**
 * The account's access banner (ADR 0018) above the page, in the page column. «Тариф і оплата»
 * says the same in its own words, so the banner stays off there.
 */
function ShellAccessBanner() {
  const pathname = usePathname();
  if (pathname === '/app/billing') return null;
  return (
    <div className="admin-container pt-3 empty:hidden">
      <AccessBanner />
    </div>
  );
}

/** The page's breadcrumbs in the desktop top bar: one line, a long title cut with its full text in `title`. */
function TopbarTrail() {
  const items = useTopbarCrumbs();
  return items === null ? null : <Breadcrumbs items={items} nowrap />;
}

/**
 * Folds the desktop sidebar to an icon rail and back: 44px, `aria-expanded` and
 * `aria-controls` on the sidebar, named for what it does now; the name is its tooltip too.
 */
function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useTranslations('app.nav');
  const label = collapsed ? t('expand') : t('collapse');
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-expanded={!collapsed}
          aria-controls="admin-sidebar"
          onClick={onToggle}
          className={cn('text-muted-foreground hover:bg-hover hover:text-foreground', {
            'ml-auto': !collapsed,
          })}
        >
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Back to the collections (owner 2026-10-06): the wordmark «stepler» alone (Golos Text 700, as in
 * the logo files; ink in light, near-white in dark). The folded rail shows no logo.
 */
function BrandLink() {
  const t = useTranslations('brand');
  return (
    <Link
      href="/app"
      translate="no"
      className={cn(
        'inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-control text-[1.1875rem] text-foreground no-underline',
        '-ml-1 px-1',
        focusRing,
      )}
    >
      <span className="font-wordmark lowercase">{t('name')}</span>
    </Link>
  );
}

/**
 * Below `lg`: the menu button and the wordmark in the bar; the button opens the sidebar as a
 * sheet from the left (focus trapped, Escape closes, focus returns to the button). Following a
 * link closes it.
 */
function MobileNav() {
  const t = useTranslations('app.nav');
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-1 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="-ml-2.5" aria-label={t('open')}>
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent aria-describedby={undefined}>
          <SheetHeader closeLabel={t('close')} className="border-b-0 pl-4 sm:pl-4">
            <SheetTitle className="sr-only">{t('label')}</SheetTitle>
            <BrandLink />
          </SheetHeader>
          <SheetBody className="flex flex-col p-3">
            <AdminNav onNavigate={() => setOpen(false)} />
          </SheetBody>
        </SheetContent>
      </Sheet>
      <BrandLink />
    </div>
  );
}
