'use client';

import { meResponseSchema, type UpdateMeRequest } from '@stepler/contracts';
import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { useToast } from '@stepler/ui/components/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useOptimistic, useTransition } from 'react';
import { apiRequest } from '@/api/client';
import { ME_QUERY_KEY } from '@/api/me';
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales';
import { setLocaleCookie } from './set-locale';

/**
 * The current locale and a change handler shared by every language control (header switch,
 * account menu). `changeLocale` takes the raw `onValueChange` string and ignores unknown values.
 *
 * On change it writes `st_locale`, saves the choice to the profile when an admin is signed in
 * (a `me` query is cached) so emails follow it, and re-renders the server tree with
 * `router.refresh()`. The refresh keeps client state, so a half-filled form (and its Turnstile
 * token) survives. A failed save shows a toast; the page still switches.
 */
export function useChangeLocale(): { locale: Locale; changeLocale: (value: string) => void } {
  const t = useTranslations('language');
  const current = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Shows the new choice at once, until the refreshed server tree brings the real locale.
  const [locale, setOptimisticLocale] = useOptimistic(isLocale(current) ? current : DEFAULT_LOCALE);
  const [, startTransition] = useTransition();

  const changeLocale = useCallback(
    (value: string) => {
      if (!isLocale(value) || value === locale) return;
      setLocaleCookie(value);
      if (queryClient.getQueryData(ME_QUERY_KEY) !== undefined) {
        const body: UpdateMeRequest = { locale: value };
        apiRequest('/me', { method: 'PATCH', body, schema: meResponseSchema }).then(
          (me) => queryClient.setQueryData(ME_QUERY_KEY, me),
          () =>
            toast({ variant: 'error', title: t('saveFailed'), description: t('saveFailedHint') }),
        );
      }
      startTransition(() => {
        setOptimisticLocale(value);
        router.refresh();
      });
    },
    [locale, queryClient, router, setOptimisticLocale, t, toast],
  );

  return { locale, changeLocale };
}

/** UA / EN. The short code is the accessible name; `title` spells out the language. */
export function LanguageSwitch({ className }: { className?: string }) {
  const t = useTranslations('language');
  const { locale, changeLocale } = useChangeLocale();
  return (
    <ToggleGroup
      aria-label={t('label')}
      value={locale}
      onValueChange={changeLocale}
      className={className}
    >
      <ToggleGroupItem value="uk" lang="uk" title={t('uk')}>
        {t('ukShort')}
      </ToggleGroupItem>
      <ToggleGroupItem value="en" lang="en" title={t('en')}>
        {t('enShort')}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
