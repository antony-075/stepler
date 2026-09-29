import { DEFAULT_LOCALE, isLocale, type Locale } from './locales';

interface LanguagePreference {
  base: string;
  q: number;
}

function parseAcceptLanguage(header: string): LanguagePreference[] {
  return header
    .split(',')
    .map((part): LanguagePreference | null => {
      const [tag, ...params] = part.trim().split(';');
      const base = tag?.trim().split('-')[0]?.toLowerCase();
      if (!base || !/^[a-z]{2,8}$/.test(base)) return null;
      const qParam = params.map((p) => p.trim().toLowerCase()).find((p) => p.startsWith('q='));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      if (!Number.isFinite(q) || q <= 0 || q > 1) return null;
      return { base, q };
    })
    .filter((p): p is LanguagePreference => p !== null)
    .sort((a, b) => b.q - a.q);
}

/**
 * Resolution order: explicit cookie → Accept-Language (by q-weight, region ignored) → default.
 * The admin profile locale is added to this chain with authentication (Phase 2).
 */
export function resolveLocale(input: { cookieLocale?: string; acceptLanguage?: string }): Locale {
  if (isLocale(input.cookieLocale)) return input.cookieLocale;
  for (const { base } of parseAcceptLanguage(input.acceptLanguage ?? '')) {
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
