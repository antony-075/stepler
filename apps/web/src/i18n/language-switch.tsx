'use client';

import { meResponseSchema, type UpdateMeRequest } from '@stepler/contracts';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stepler/ui/components/select';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useOptimistic, useRef, useTransition } from 'react';
import { apiRequest } from '@/api/client';
import { SETTING_SELECT } from '@/components/setting-control';
import { ME_QUERY_KEY } from '@/api/me';
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales';
import { setLocaleCookie } from './set-locale';

/**
 * The current locale and a change handler for the language control on /app/settings.
 * `changeLocale` takes the raw `onValueChange` string and ignores unknown values.
 *
 * On change it writes `st_locale`, saves the choice to the profile when an admin is signed in
 * (a `me` query is cached) so emails follow it, and re-renders the server tree with
 * `router.refresh()`. The refresh keeps client state. A failed save shows a toast; the page still
 * switches.
 *
 * Saves run one at a time (a shared mutation `scope`), so quick UA → EN → UA clicks reach the
 * server in order and the profile ends on the last choice; only the latest choice updates the
 * cache or reports a failure.
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
  const latestChoice = useRef<Locale | null>(null);
  const { mutate: saveLocale } = useMutation({
    scope: { id: 'me-locale' },
    mutationFn: (value: Locale) => {
      const body: UpdateMeRequest = { locale: value };
      return apiRequest('/me', { method: 'PATCH', body, schema: meResponseSchema });
    },
    onSuccess: (me, value) => {
      if (value === latestChoice.current) queryClient.setQueryData(ME_QUERY_KEY, me);
    },
    onError: (_error, value) => {
      if (value !== latestChoice.current) return;
      toast({ variant: 'error', title: t('saveFailed'), description: t('saveFailedHint') });
    },
  });

  const changeLocale = useCallback(
    (value: string) => {
      if (!isLocale(value) || value === locale) return;
      setLocaleCookie(value);
      if (queryClient.getQueryData(ME_QUERY_KEY) !== undefined) {
        latestChoice.current = value;
        saveLocale(value);
      }
      startTransition(() => {
        setOptimisticLocale(value);
        router.refresh();
      });
    },
    [locale, queryClient, router, saveLocale, setOptimisticLocale],
  );

  return { locale, changeLocale };
}

/** Українська / English as a select, each name in its own language (`lang`). */
export function LanguageSwitch({
  labelledBy,
  describedBy,
}: {
  labelledBy: string;
  describedBy?: string;
}) {
  const t = useTranslations('language');
  const { locale, changeLocale } = useChangeLocale();
  return (
    <Select value={locale} onValueChange={changeLocale}>
      <SelectTrigger
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={SETTING_SELECT}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {/* `lang` on the text too: the trigger shows a copy of it, outside the option. */}
          <SelectItem value="uk" lang="uk">
            <span lang="uk">{t('uk')}</span>
          </SelectItem>
          <SelectItem value="en" lang="en">
            <span lang="en">{t('en')}</span>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
