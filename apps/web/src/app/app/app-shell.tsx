'use client';

import { Button } from '@stepler/ui/components/button';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';
import { isApiError } from '@/api/client';
import { fetchMe, ME_QUERY_KEY } from '@/api/me';
import { SiteHeader } from '@/components/site-header';
import { errorMessageKey } from '@/errors/error-message';
import { setLocaleCookie } from '@/i18n/set-locale';
import { AccountMenu } from './account-menu';
import { AdminNav } from './admin-nav';

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe });

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

  if (me.data === undefined) {
    const failed = me.error !== null && !unauthenticated;
    const failure = isApiError(me.error) ? me.error.code : 'INTERNAL';
    return (
      <main className="stepler-atmosphere grid min-h-dvh place-items-center px-4">
        {failed ? (
          <div className="grid gap-4 text-center">
            <p role="alert">{t(errorMessageKey(failure))}</p>
            <Button onClick={() => void me.refetch()}>{t('verify.retry')}</Button>
          </div>
        ) : (
          <p role="status">{t('app.loading')}</p>
        )}
      </main>
    );
  }

  return (
    <div className="stepler-atmosphere flex min-h-dvh flex-col">
      <SiteHeader>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <AdminNav items={[{ href: '/app', label: t('app.nav.collections') }]} />
          <AccountMenu email={me.data.email} />
        </div>
      </SiteHeader>
      <div className="flex-1">{children}</div>
    </div>
  );
}
