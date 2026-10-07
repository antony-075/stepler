import { readFileSync, statSync } from 'node:fs';
import { currentLegalVersion, LEGAL_DOCUMENTS } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { LOCALES } from '@/i18n/locales';
import { fillLegalPlaceholders, legalDocumentFile, loadLegalDocument } from './documents';
import { legalDocumentFromSlug, legalPath } from './slugs';

const DRAFT_MARK = { uk: 'Чернетка', en: 'Draft' } as const;

// Every registry entry needs a body per locale; the page owns the h1 and only Markdown gets in
// (the HTML is injected as repo-controlled content, so a stray tag must never pass this test).
describe.each(LEGAL_DOCUMENTS)('$document $version', (entry) => {
  describe.each(LOCALES)('%s', (locale) => {
    const file = legalDocumentFile(entry.document, locale);
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');

    test('exists and is not empty', () => {
      expect(statSync(file).size).toBeGreaterThanOrEqual(100);
    });

    test('has no h1 (the page renders it)', () => {
      expect(lines.filter((line) => line.startsWith('# '))).toEqual([]);
    });

    test('contains no raw HTML', () => {
      expect(text).not.toMatch(/<[A-Za-z/]/);
    });

    test('starts with the draft line exactly when the registry says draft', () => {
      const first = lines.find((line) => line.trim() !== '') ?? '';
      if (entry.draft) {
        expect(first.startsWith('> ')).toBe(true);
        expect(first).toContain(DRAFT_MARK[locale]);
      } else {
        expect(first.startsWith('> ')).toBe(false);
      }
    });
  });
});

describe('loadLegalDocument', () => {
  test('renders the Markdown to HTML with the registry entry', async () => {
    const { meta, html } = await loadLegalDocument('TERMS', 'uk');
    expect(meta.version).toBe(currentLegalVersion('TERMS').version);
    expect(meta.document).toBe('TERMS');
    expect(html).toContain('<h2');
    expect(html).toContain('<blockquote');
  });

  test('fills the contact e-mail placeholder when the address is given', async () => {
    const { html } = await loadLegalDocument('PRIVACY', 'en', 'privacy@example.com');
    expect(html).not.toContain('[LEGAL_CONTACT_EMAIL]');
    expect(html).toContain('href="mailto:privacy@example.com"');
  });

  test('leaves the placeholder visibly unfilled without an address', async () => {
    const { html } = await loadLegalDocument('PRIVACY', 'en');
    expect(html).toContain('[LEGAL_CONTACT_EMAIL]');
  });
});

describe('fillLegalPlaceholders', () => {
  test('replaces every occurrence of the contact placeholder and nothing else', () => {
    const markdown = 'Write to [LEGAL_CONTACT_EMAIL] or [LEGAL_CONTACT_EMAIL]. [LEGAL ADDRESS]';
    expect(fillLegalPlaceholders(markdown, { contactEmail: 'legal@example.com' })).toBe(
      'Write to legal@example.com or legal@example.com. [LEGAL ADDRESS]',
    );
  });

  test('keeps the placeholder when the address is unset', () => {
    const markdown = 'Write to [LEGAL_CONTACT_EMAIL].';
    expect(fillLegalPlaceholders(markdown, { contactEmail: undefined })).toBe(markdown);
  });
});

describe('slugs', () => {
  test('map both ways and reject unknown values', () => {
    expect(legalDocumentFromSlug('terms')).toBe('TERMS');
    expect(legalDocumentFromSlug('privacy')).toBe('PRIVACY');
    expect(legalDocumentFromSlug('x')).toBeNull();
    expect(legalDocumentFromSlug('TERMS')).toBeNull();
    expect(legalPath('PRIVACY')).toBe('/legal/privacy');
    expect(legalPath('TERMS')).toBe('/legal/terms');
  });

  test('file names carry slug, locale and version', () => {
    expect(legalDocumentFile('TERMS', 'uk')).toMatch(/content\/legal\/terms\.uk\.v2\.md$/);
    expect(legalDocumentFile('PRIVACY', 'en')).toMatch(/content\/legal\/privacy\.en\.v2\.md$/);
  });
});

// v2 (slice 9, R8): every changed paragraph keeps its lawyer marker, and the promise the product
// does not keep (acknowledging receipt) is gone.
describe('v2 drafts', () => {
  const REVIEW = { uk: '[ПЕРЕВІРИТИ ЮРИСТОМ]', en: '[LAWYER TO CONFIRM]' } as const;
  test.each(LEGAL_DOCUMENTS.flatMap((entry) => LOCALES.map((locale) => [entry, locale] as const)))(
    '%o %s carries the lawyer marker',
    (entry, locale) => {
      expect(readFileSync(legalDocumentFile(entry.document, locale), 'utf8')).toContain(
        REVIEW[locale],
      );
    },
  );

  test('the uk terms no longer promise to acknowledge receipt', () => {
    const text = readFileSync(legalDocumentFile('TERMS', 'uk'), 'utf8');
    expect(text).not.toContain('підтверджуємо отримання');
    expect(text).toContain('Поскаржитися');
  });

  // Slice 9b: the in-app appeal and the 90-day quarantine, in both languages.
  test('the terms describe the in-app appeal and the 90-day quarantine', () => {
    const uk = readFileSync(legalDocumentFile('TERMS', 'uk'), 'utf8');
    expect(uk).toContain('апеляц');
    expect(uk).toContain('90 днів');
    const en = readFileSync(legalDocumentFile('TERMS', 'en'), 'utf8');
    expect(en).toContain('appeal');
    expect(en).toContain('90 days');
    const privacy = readFileSync(legalDocumentFile('PRIVACY', 'uk'), 'utf8');
    expect(privacy).toContain('карантині');
  });
});
