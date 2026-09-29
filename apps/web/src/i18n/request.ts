import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_TIME_ZONE, LOCALE_COOKIE } from './locales';
import { resolveLocale } from './resolve-locale';

export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale({
    cookieLocale: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get('accept-language') ?? undefined,
  });
  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };
  // Explicit zone keeps server and client rendering identical. Per-user zones come with
  // features that display dates.
  return { locale, messages: messages.default, timeZone: DEFAULT_TIME_ZONE };
});
