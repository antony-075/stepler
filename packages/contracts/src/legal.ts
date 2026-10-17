import { z } from 'zod';

/**
 * Legal documents (spec §15, ADR 0011 "versioned per locale"). The registry below is the one
 * source of each document's current version for the web (pages, banner) and the API
 * (acceptance recording, the gate). The texts themselves are Markdown files in the web app,
 * named after the slug, locale and version; publishing a new version is a new file pair plus a
 * new entry here (docs/legal/README.md). Engineering never writes legal wording.
 */
export const legalDocumentKeySchema = z.enum(['TERMS', 'PRIVACY']);
export type LegalDocumentKey = z.infer<typeof legalDocumentKeySchema>;

/** Version ids: `v1`, `v2`, … (mirrored by a CHECK constraint on acceptance rows). */
export const LEGAL_VERSION_PATTERN = /^v[1-9]\d{0,3}$/;

export interface LegalDocumentVersion {
  document: LegalDocumentKey;
  version: string;
  /** `YYYY-MM-DD`, shown on the page. */
  effectiveDate: string;
  /** A placeholder text: the page shows the draft banner; production refuses to start on it. */
  draft: boolean;
  /**
   * Whether everyone who accepted an earlier version must accept this one again (owner decision
   * L3: a new text does not force re-acceptance by default; a separate product/legal decision
   * flips this in the same commit as the text).
   */
  requireReacceptance: boolean;
}

/** Exactly one entry per document: its current version. */
export const LEGAL_DOCUMENTS: readonly LegalDocumentVersion[] = [
  // v3 (billing M4, plan Task 22): payments, the trial, auto-renewal, cancellation, refunds by
  // the operator, view-only mode, retention and deletion after the paid period. Material
  // changes, so everyone accepts again ([Q7]). The effective date is a placeholder until the
  // texts are final (they are drafts; production refuses to start on a draft).
  // History: v1 (slice 7), v2 (slice 9: reports, moderation; 9b: appeals, quarantine).
  {
    document: 'TERMS',
    version: 'v3',
    effectiveDate: '2026-10-15',
    draft: true,
    requireReacceptance: true,
  },
  {
    document: 'PRIVACY',
    version: 'v3',
    effectiveDate: '2026-10-15',
    draft: true,
    requireReacceptance: true,
  },
];

export function currentLegalVersion(document: LegalDocumentKey): LegalDocumentVersion {
  const entry = LEGAL_DOCUMENTS.find((candidate) => candidate.document === document);
  // The registry test guarantees one entry per key; this is for the type system only.
  if (entry === undefined) throw new Error(`No current version for ${document}`);
  return entry;
}

/**
 * The versions a person accepted on the registration card (owner decision L1): sent with the
 * registration (ADR 0019) and with the Google start, recorded with the account. The API
 * only ever stores the registry's current versions; the pattern keeps arbitrary strings out.
 */
export const legalVersionsSchema = z
  .object({
    terms: z.string().regex(LEGAL_VERSION_PATTERN),
    privacy: z.string().regex(LEGAL_VERSION_PATTERN),
  })
  .strict();
export type LegalVersions = z.infer<typeof legalVersionsSchema>;

/** The current version of every document, in the shape the sign-in card sends back. */
export function currentLegalVersions(): LegalVersions {
  return {
    terms: currentLegalVersion('TERMS').version,
    privacy: currentLegalVersion('PRIVACY').version,
  };
}

/** Whether both versions are the current ones (a stale card or link fails this). */
export function isCurrentLegalVersions(versions: LegalVersions): boolean {
  const current = currentLegalVersions();
  return versions.terms === current.terms && versions.privacy === current.privacy;
}

/**
 * `POST /api/v1/me/legal-acceptances`: the fallback page's acceptance (accounts from before the
 * sign-in checkbox, stale links, forced re-acceptance). One or both documents.
 */
export const legalAcceptanceRequestSchema = z
  .object({
    acceptances: z
      .array(
        z
          .object({
            document: legalDocumentKeySchema,
            version: z.string().regex(LEGAL_VERSION_PATTERN),
          })
          .strict(),
      )
      .min(1)
      .max(2),
  })
  .strict();
export type LegalAcceptanceRequest = z.infer<typeof legalAcceptanceRequestSchema>;

/** One acceptance as stored for a user. */
export interface LegalAcceptanceRecord {
  document: LegalDocumentKey;
  version: string;
  /** ISO 8601. */
  acceptedAt: string;
}

/** Part of `GET /api/v1/me`: whether the user may use the app, and what they accepted. */
export const legalStatusSchema = z.object({
  accepted: z.boolean(),
  documents: z.array(
    z.object({
      document: legalDocumentKeySchema,
      requiredVersion: z.string(),
      acceptedVersion: z.string().nullable(),
      acceptedAt: z.iso.datetime().nullable(),
    }),
  ),
});
export type LegalStatus = z.infer<typeof legalStatusSchema>;

/**
 * The status for a user's acceptance rows against a registry (the current one by default; tests
 * pass their own). Per entry: the latest acceptance (by `acceptedAt`) is what is shown; the
 * entry is satisfied by any accepted version unless it requires re-acceptance, then only by its
 * own version. `accepted` is true when every entry is satisfied; order follows the registry.
 */
export function legalStatus(
  acceptances: readonly LegalAcceptanceRecord[],
  registry: readonly LegalDocumentVersion[] = LEGAL_DOCUMENTS,
): LegalStatus {
  const documents = registry.map((entry) => {
    const rows = acceptances.filter((row) => row.document === entry.document);
    const latest = rows.reduce<LegalAcceptanceRecord | null>(
      (best, row) => (best === null || row.acceptedAt > best.acceptedAt ? row : best),
      null,
    );
    const satisfied = entry.requireReacceptance
      ? rows.some((row) => row.version === entry.version)
      : rows.length > 0;
    return {
      document: entry.document,
      requiredVersion: entry.version,
      acceptedVersion: latest?.version ?? null,
      acceptedAt: latest?.acceptedAt ?? null,
      satisfied,
    };
  });
  return {
    accepted: documents.every((doc) => doc.satisfied),
    documents: documents.map(({ satisfied: _satisfied, ...doc }) => doc),
  };
}
