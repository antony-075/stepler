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
 * `process.cwd()` is the app directory both in `next dev` and in the standalone server, and
 * `next.config.ts` traces the directory into the standalone output.
 */
export const LEGAL_CONTENT_DIR = path.join(process.cwd(), 'content/legal');

export function legalDocumentFile(document: LegalDocumentKey, locale: Locale): string {
  const { version } = currentLegalVersion(document);
  return path.join(LEGAL_CONTENT_DIR, `${LEGAL_SLUGS[document]}.${locale}.${version}.md`);
}

/**
 * The current version of a document in a locale, rendered to HTML. The files are repo-controlled
 * content (a unit test rejects raw HTML in them), so the page may inject the result as is.
 */
export async function loadLegalDocument(
  document: LegalDocumentKey,
  locale: Locale,
): Promise<{ meta: LegalDocumentVersion; html: string }> {
  const markdown = await readFile(legalDocumentFile(document, locale), 'utf8');
  return {
    meta: currentLegalVersion(document),
    html: marked.parse(markdown, { gfm: true, async: false }),
  };
}
