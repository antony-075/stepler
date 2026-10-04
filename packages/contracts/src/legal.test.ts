import { describe, expect, test } from 'vitest';
import {
  currentLegalVersion,
  currentLegalVersions,
  isCurrentLegalVersions,
  LEGAL_DOCUMENTS,
  LEGAL_VERSION_PATTERN,
  legalAcceptanceRequestSchema,
  type LegalDocumentVersion,
  legalDocumentKeySchema,
  legalStatus,
  legalStatusSchema,
  legalVersionsSchema,
} from './index.js';

describe('LEGAL_DOCUMENTS', () => {
  test('has exactly one current version per document', () => {
    for (const document of legalDocumentKeySchema.options) {
      expect(LEGAL_DOCUMENTS.filter((entry) => entry.document === document)).toHaveLength(1);
      expect(currentLegalVersion(document).document).toBe(document);
    }
    expect(LEGAL_DOCUMENTS).toHaveLength(legalDocumentKeySchema.options.length);
  });

  test('every entry has a well-formed version and effective date', () => {
    for (const entry of LEGAL_DOCUMENTS) {
      expect(entry.version).toMatch(LEGAL_VERSION_PATTERN);
      expect(entry.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof entry.draft).toBe('boolean');
      expect(typeof entry.requireReacceptance).toBe('boolean');
    }
  });

  test('LEGAL_VERSION_PATTERN accepts v1…v9999 only', () => {
    for (const ok of ['v1', 'v12', 'v9999']) expect(ok).toMatch(LEGAL_VERSION_PATTERN);
    for (const bad of ['1', 'v0', 'v01', 'v10000', 'V1', 'v1 ', '<script>']) {
      expect(bad).not.toMatch(LEGAL_VERSION_PATTERN);
    }
  });
});

describe('legalStatus', () => {
  const at = '2026-10-04T10:00:00.000Z';

  test('nothing accepted', () => {
    const status = legalStatus([]);
    expect(status.accepted).toBe(false);
    expect(status.documents.map((d) => d.document)).toEqual(
      LEGAL_DOCUMENTS.map((entry) => entry.document),
    );
    for (const [index, doc] of status.documents.entries()) {
      expect(doc.requiredVersion).toBe(LEGAL_DOCUMENTS[index]!.version);
      expect(doc.acceptedVersion).toBeNull();
      expect(doc.acceptedAt).toBeNull();
    }
  });

  test('one document accepted is not enough', () => {
    const status = legalStatus([{ document: 'TERMS', version: 'v1', acceptedAt: at }]);
    expect(status.accepted).toBe(false);
    expect(status.documents[0]).toEqual({
      document: 'TERMS',
      requiredVersion: 'v1',
      acceptedVersion: 'v1',
      acceptedAt: at,
    });
    expect(status.documents[1]!.acceptedVersion).toBeNull();
  });

  test('both accepted', () => {
    const status = legalStatus([
      { document: 'TERMS', version: 'v1', acceptedAt: at },
      { document: 'PRIVACY', version: 'v1', acceptedAt: at },
    ]);
    expect(status.accepted).toBe(true);
    for (const doc of status.documents) expect(doc.acceptedAt).toBe(at);
  });

  test('a newer version does not force re-acceptance unless flagged (L3)', () => {
    const registry: readonly LegalDocumentVersion[] = [
      {
        document: 'TERMS',
        version: 'v2',
        effectiveDate: '2027-01-01',
        draft: false,
        requireReacceptance: false,
      },
      {
        document: 'PRIVACY',
        version: 'v2',
        effectiveDate: '2027-01-01',
        draft: false,
        requireReacceptance: true,
      },
    ];
    const v1Only = [
      { document: 'TERMS' as const, version: 'v1', acceptedAt: at },
      { document: 'PRIVACY' as const, version: 'v1', acceptedAt: at },
    ];
    const stale = legalStatus(v1Only, registry);
    expect(stale.accepted).toBe(false);
    expect(stale.documents[0]!.requiredVersion).toBe('v2');
    expect(stale.documents[0]!.acceptedVersion).toBe('v1');
    expect(stale.documents[1]!.acceptedVersion).toBe('v1');

    const later = '2027-01-02T00:00:00.000Z';
    const fresh = legalStatus(
      [...v1Only, { document: 'PRIVACY', version: 'v2', acceptedAt: later }],
      registry,
    );
    expect(fresh.accepted).toBe(true);
    expect(fresh.documents[1]).toEqual({
      document: 'PRIVACY',
      requiredVersion: 'v2',
      acceptedVersion: 'v2',
      acceptedAt: later,
    });
  });

  test('the latest acceptance wins regardless of input order', () => {
    const later = '2026-11-01T00:00:00.000Z';
    const status = legalStatus([
      { document: 'TERMS', version: 'v2', acceptedAt: later },
      { document: 'TERMS', version: 'v1', acceptedAt: at },
    ]);
    expect(status.documents[0]!.acceptedVersion).toBe('v2');
    expect(status.documents[0]!.acceptedAt).toBe(later);
  });

  test('round-trips through legalStatusSchema', () => {
    const status = legalStatus([{ document: 'PRIVACY', version: 'v1', acceptedAt: at }]);
    expect(legalStatusSchema.parse(status)).toEqual(status);
    expect(legalStatusSchema.safeParse({ ...status, accepted: 'yes' }).success).toBe(false);
  });
});

describe('legalVersionsSchema', () => {
  test('accepts both versions', () => {
    expect(legalVersionsSchema.parse({ terms: 'v1', privacy: 'v1' })).toEqual({
      terms: 'v1',
      privacy: 'v1',
    });
  });

  test('rejects a missing key, a malformed version and extra keys', () => {
    for (const bad of [
      { terms: 'v1' },
      { terms: '1', privacy: 'v1' },
      { terms: '<script>', privacy: 'v1' },
      { terms: 'v1', privacy: 'v1', cookies: 'v1' },
    ]) {
      expect(legalVersionsSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('currentLegalVersions', () => {
  test('mirrors the registry', () => {
    expect(currentLegalVersions()).toEqual({
      terms: currentLegalVersion('TERMS').version,
      privacy: currentLegalVersion('PRIVACY').version,
    });
  });

  test('isCurrentLegalVersions is true only for the current pair', () => {
    expect(isCurrentLegalVersions(currentLegalVersions())).toBe(true);
    expect(isCurrentLegalVersions({ ...currentLegalVersions(), terms: 'v9' })).toBe(false);
    expect(isCurrentLegalVersions({ ...currentLegalVersions(), privacy: 'v9' })).toBe(false);
  });
});

describe('legalAcceptanceRequestSchema', () => {
  test('accepts one or two acceptances', () => {
    const one = { acceptances: [{ document: 'TERMS', version: 'v1' }] };
    expect(legalAcceptanceRequestSchema.parse(one)).toEqual(one);
    expect(
      legalAcceptanceRequestSchema.safeParse({
        acceptances: [
          { document: 'TERMS', version: 'v1' },
          { document: 'PRIVACY', version: 'v1' },
        ],
      }).success,
    ).toBe(true);
  });

  test('rejects empty, too many, malformed versions, unknown documents and extra keys', () => {
    const item = { document: 'TERMS', version: 'v1' };
    for (const bad of [
      { acceptances: [] },
      { acceptances: [item, item, item] },
      { acceptances: [{ document: 'TERMS', version: '1' }] },
      { acceptances: [{ document: 'COOKIES', version: 'v1' }] },
      { acceptances: [{ ...item, extra: true }] },
      { acceptances: [item], extra: true },
    ]) {
      expect(legalAcceptanceRequestSchema.safeParse(bad).success).toBe(false);
    }
  });
});
