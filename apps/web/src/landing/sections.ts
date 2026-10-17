/** The landing's anchors, in page order; the header, the mobile menu and the footer link to them. */
export const SECTION = {
  how: 'how',
  demo: 'demo',
  templates: 'templates',
  cases: 'cases',
  privacy: 'privacy',
  pricing: 'pricing',
  faq: 'faq',
} as const;

/** The anchors in the header and the menu (the demo and the use cases are reached by scrolling). */
export const NAV_SECTIONS = ['how', 'templates', 'privacy', 'pricing', 'faq'] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

/** The real routes the landing's buttons lead to (no return path on sign-in, slice 9 [P8]). */
export const ROUTE = {
  register: '/register',
  login: '/login',
  pricing: '/pricing',
  app: '/app',
} as const;

/** Every landing section sits under the sticky header (56px) with some air when jumped to. */
export const SECTION_SCROLL = 'scroll-mt-20';

/**
 * An anchor's address: the bare `#how` on the landing itself, `/#how` from another public page
 * (/pricing) that shares the landing's header and footer.
 */
export function sectionHref(key: keyof typeof SECTION, onLanding: boolean): string {
  return `${onLanding ? '' : '/'}#${SECTION[key]}`;
}
