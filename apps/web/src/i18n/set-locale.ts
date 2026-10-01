import { LOCALE_COOKIE, type Locale } from './locales';

const ONE_YEAR_SECONDS = 31_536_000;

/**
 * `document.cookie` value for an explicit language choice (ADR 0011). Not HttpOnly: the client
 * switch writes it. Lax is enough (it carries no authority) and still reaches the server on a
 * top-level navigation.
 */
export function localeCookie(locale: Locale, { secure }: { secure: boolean }): string {
  const attributes = [`max-age=${ONE_YEAR_SECONDS}`, 'path=/', 'samesite=lax'];
  if (secure) attributes.push('secure');
  return [`${LOCALE_COOKIE}=${locale}`, ...attributes].join('; ');
}

/** Browser only. The server reads the cookie on the next request or `router.refresh()`. */
export function setLocaleCookie(locale: Locale): void {
  document.cookie = localeCookie(locale, { secure: window.location.protocol === 'https:' });
}
