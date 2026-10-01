/** Explicit theme choice. No cookie (or `system`) means the page follows the OS setting. */
export const THEME_COOKIE = 'st_theme';
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

const ONE_YEAR_SECONDS = 31_536_000;

export function parseTheme(value: string | undefined): ThemePreference {
  return (THEME_PREFERENCES as readonly (string | undefined)[]).includes(value)
    ? (value as ThemePreference)
    : 'system';
}

/**
 * `document.cookie` value for a preference. Not HttpOnly: the client switch writes it. Lax is
 * enough (it carries no authority) and still reaches the server on a top-level navigation.
 */
export function themeCookie(preference: ThemePreference, { secure }: { secure: boolean }): string {
  const attributes = [`max-age=${ONE_YEAR_SECONDS}`, 'path=/', 'samesite=lax'];
  if (secure) attributes.push('secure');
  return [`${THEME_COOKIE}=${preference}`, ...attributes].join('; ');
}

/** `<html data-theme>`: set only for an explicit choice; the tokens follow the OS without it. */
export function themeAttribute(preference: ThemePreference): 'light' | 'dark' | undefined {
  return preference === 'system' ? undefined : preference;
}
