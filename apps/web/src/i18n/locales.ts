export const LOCALES = ['uk', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'uk';
/** Explicit locale choice. There is no locale segment in URLs (ADR 0011). */
export const LOCALE_COOKIE = 'ed_locale';

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/** Default display time zone until per-user zones exist. */
export const DEFAULT_TIME_ZONE = 'Europe/Kyiv';
