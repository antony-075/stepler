// Server only: imported from server components (it reads files from the deployment).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  currentLegalVersion,
  type LegalDocumentKey,
  type LegalDocumentVersion,
} from '@stepler/contracts';
import { marked } from 'marked';
import type { Locale } from '@/i18n/locales';
import { LEGAL_SLUGS } from './slugs';

/**
 * The legal texts, one Markdown file per document × locale × version (docs/legal/README.md).
 * `process.cwd()` is the app directory both in `next dev` and in the standalone server; the
 * build copies the directory next to the standalone server (`scripts/copy-standalone-assets.mjs`).
 */
export const LEGAL_CONTENT_DIR = path.join(process.cwd(), 'content/legal');

export function legalDocumentFile(document: LegalDocumentKey, locale: Locale): string {
  const { version } = currentLegalVersion(document);
  return path.join(LEGAL_CONTENT_DIR, `${LEGAL_SLUGS[document]}.${locale}.${version}.md`);
}

/** Written by the owner/lawyer in the texts; filled from `LEGAL_CONTACT_EMAIL` at render time. */
export const CONTACT_EMAIL_PLACEHOLDER = '[LEGAL_CONTACT_EMAIL]';

/**
 * Fills the deployment-specific placeholders of a text. An unset address leaves the placeholder
 * as written, so a draft visibly lacks it (production cannot start without it, `readiness.ts`).
 * The address is the env's validated e-mail, so it adds no Markdown or HTML of its own; GFM turns
 * it into a `mailto:` link.
 */
export function fillLegalPlaceholders(
  markdown: string,
  { contactEmail }: { contactEmail: string | undefined },
): string {
  if (contactEmail === undefined) return markdown;
  return markdown.replaceAll(CONTACT_EMAIL_PLACEHOLDER, contactEmail);
}

/**
 * The current version of a document in a locale, rendered to HTML. The files are repo-controlled
 * content (a unit test rejects raw HTML in them), so the page may inject the result as is.
 */
export async function loadLegalDocument(
  document: LegalDocumentKey,
  locale: Locale,
  contactEmail?: string,
): Promise<{ meta: LegalDocumentVersion; html: string }> {
  const markdown = await readFile(legalDocumentFile(document, locale), 'utf8');
  return {
    meta: currentLegalVersion(document),
    html: marked.parse(fillLegalPlaceholders(markdown, { contactEmail }), {
      gfm: true,
      async: false,
    }),
  };
}
