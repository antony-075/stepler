import type { LegalDocumentKey } from '@stepler/contracts';

/** URL slugs of the legal documents: `/legal/terms`, `/legal/privacy`. */
export const LEGAL_SLUGS = { TERMS: 'terms', PRIVACY: 'privacy' } as const satisfies Record<
  LegalDocumentKey,
  string
>;
export type LegalSlug = (typeof LEGAL_SLUGS)[LegalDocumentKey];

/** The document behind a URL slug; `null` for anything else (the page answers 404). */
export function legalDocumentFromSlug(slug: string): LegalDocumentKey | null {
  const entry = (Object.entries(LEGAL_SLUGS) as [LegalDocumentKey, LegalSlug][]).find(
    ([, candidate]) => candidate === slug,
  );
  return entry?.[0] ?? null;
}

export function legalPath(document: LegalDocumentKey): `/legal/${LegalSlug}` {
  return `/legal/${LEGAL_SLUGS[document]}`;
}
