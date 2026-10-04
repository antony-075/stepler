import type { LegalDocumentVersion } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { loadWebEnv } from '@/env';
import { assertLegalReady } from './readiness';

const published = (document: LegalDocumentVersion['document']): LegalDocumentVersion => ({
  document,
  version: 'v1',
  effectiveDate: '2026-10-04',
  draft: false,
  requireReacceptance: false,
});
const draft = (document: LegalDocumentVersion['document']): LegalDocumentVersion => ({
  ...published(document),
  version: 'v3',
  draft: true,
});
const email = 'privacy@example.com';

describe('assertLegalReady', () => {
  test('refuses a draft, naming the document and version', () => {
    expect(() =>
      assertLegalReady({
        documents: [published('TERMS'), draft('PRIVACY')],
        allowDraft: false,
        contactEmail: email,
      }),
    ).toThrow(/PRIVACY v3 is a draft/);
  });

  test('refuses a missing contact e-mail, naming the variable', () => {
    expect(() =>
      assertLegalReady({
        documents: [published('TERMS'), published('PRIVACY')],
        allowDraft: false,
        contactEmail: undefined,
      }),
    ).toThrow(/LEGAL_CONTACT_EMAIL is not set/);
  });

  test('lists every problem in one error', () => {
    let message = '';
    try {
      assertLegalReady({
        documents: [draft('TERMS'), draft('PRIVACY')],
        allowDraft: false,
        contactEmail: undefined,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/TERMS v3 is a draft/);
    expect(message).toMatch(/PRIVACY v3 is a draft/);
    expect(message).toMatch(/LEGAL_CONTACT_EMAIL is not set/);
  });

  test('passes published texts with a contact', () => {
    expect(() =>
      assertLegalReady({
        documents: [published('TERMS'), published('PRIVACY')],
        allowDraft: false,
        contactEmail: email,
      }),
    ).not.toThrow();
  });

  test('never throws when drafts are allowed (dev, CI, staging)', () => {
    expect(() =>
      assertLegalReady({
        documents: [draft('TERMS'), draft('PRIVACY')],
        allowDraft: true,
        contactEmail: undefined,
      }),
    ).not.toThrow();
  });
});

describe('loadWebEnv legal variables', () => {
  const base = { API_INTERNAL_URL: 'http://a' };

  test('LEGAL_ALLOW_DRAFT defaults to false and parses true', () => {
    expect(loadWebEnv(base).LEGAL_ALLOW_DRAFT).toBe(false);
    expect(loadWebEnv({ ...base, LEGAL_ALLOW_DRAFT: 'true' }).LEGAL_ALLOW_DRAFT).toBe(true);
    expect(loadWebEnv({ ...base, LEGAL_ALLOW_DRAFT: 'false' }).LEGAL_ALLOW_DRAFT).toBe(false);
    expect(() => loadWebEnv({ ...base, LEGAL_ALLOW_DRAFT: 'yes' })).toThrow(/LEGAL_ALLOW_DRAFT/);
  });

  test('LEGAL_CONTACT_EMAIL is optional and must be an address', () => {
    expect(loadWebEnv(base).LEGAL_CONTACT_EMAIL).toBeUndefined();
    expect(loadWebEnv({ ...base, LEGAL_CONTACT_EMAIL: email }).LEGAL_CONTACT_EMAIL).toBe(email);
    expect(() => loadWebEnv({ ...base, LEGAL_CONTACT_EMAIL: 'not-an-email' })).toThrow(
      /LEGAL_CONTACT_EMAIL/,
    );
  });
});
