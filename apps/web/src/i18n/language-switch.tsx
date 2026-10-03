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
import { ME_QUERY_KEY } from '@/api/me';
import { LanguageFlag } from './language-flag';
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales';
import { setLocaleCookie } from './set-locale';

/**
 * The current locale and a change handler for the language select (/app/account and the public
 * headers).
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

type LanguageSwitchProps =
  | {
      /** The field on /app/account: labelled by its setting's heading, full width up to 320px. */
      variant?: 'field';
      labelledBy: string;
      describedBy?: string;
    }
  | {
      /** In a page header (guest page, landing): as wide as its value, named «Мова». */
      variant: 'header';
    };

/**
 * Українська / English as a select, each with its flag and its name in its own language (`lang`).
 * The same control everywhere: a field on /app/account, a compact one in the public headers.
 */
export function LanguageSwitch(props: LanguageSwitchProps) {
  const t = useTranslations('language');
  const { locale, changeLocale } = useChangeLocale();
  const header = props.variant === 'header';
  return (
    <Select value={locale} onValueChange={changeLocale}>
      <SelectTrigger
        {...(header
          ? { 'aria-label': t('label') }
          : { 'aria-labelledby': props.labelledBy, 'aria-describedby': props.describedBy })}
        className={header ? 'h-10 w-auto px-3 pointer-coarse:h-11' : 'w-full sm:max-w-80'}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align={header ? 'end' : undefined}>
        <SelectGroup>
          {/* `lang` on the text too: the trigger shows a copy of it, outside the option. */}
          <SelectItem value="uk" lang="uk">
            <LanguageFlag locale="uk" />
            <span lang="uk">{t('uk')}</span>
          </SelectItem>
          <SelectItem value="en" lang="en">
            <LanguageFlag locale="en" />
            <span lang="en">{t('en')}</span>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
