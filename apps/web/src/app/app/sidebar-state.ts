/**
 * Whether the desktop sidebar is folded to an icon rail, remembered per browser (owner
 * 2026-10-02). A cookie rather than localStorage: the server renders the shell already folded,
 * so the page never jumps after hydration (the same reason the theme is a cookie).
 */
export const SIDEBAR_COOKIE = 'st_sidebar';

const ONE_YEAR_SECONDS = 31_536_000;

export const isSidebarCollapsed = (value: string | undefined): boolean => value === 'collapsed';

/** `document.cookie` value. Lax and not HttpOnly, like the theme: it carries no authority. */
export function sidebarCookie(collapsed: boolean, { secure }: { secure: boolean }): string {
  const attributes = [`max-age=${ONE_YEAR_SECONDS}`, 'path=/', 'samesite=lax'];
  if (secure) attributes.push('secure');
  return [`${SIDEBAR_COOKIE}=${collapsed ? 'collapsed' : 'expanded'}`, ...attributes].join('; ');
}
