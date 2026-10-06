import type { LegalDocumentKey } from '@stepler/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getWebEnv } from '@/env';
import { LanguageSwitch } from '@/i18n/language-switch';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { loadLegalDocument } from '@/legal/documents';
import { ContactBlock, DraftBanner, LegalArticle, LegalMeta } from '@/legal/legal-article';
import { legalDocumentFromSlug } from '@/legal/slugs';

// The legal pages (DESIGN-SYSTEM.md §6.11; spec §15; plan slice 10, Review Focus 4).
// Design pass (frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design):
// - A document, not an app: a server component with no client JavaScript but the language
//   switch; the text reads with JavaScript off, at 320px, at 200% zoom and on paper.
// - One left edge with every other page (the header's wordmark, the h1 and the text start at
//   the container's edge); the measure is capped at 68ch (65–75 characters per line), left
//   aligned, 17px / 1.6 for long reading. Wide screens grow the margin, not the line.
// - Hierarchy from the content itself: the h1 is the document's name, the meta line (version,
//   effective date) sits under it in the small muted size, the sections are the Markdown's own
//   numbered h2s. No eyebrows, cards or decoration.
// - The draft banner is a warning Alert with role="note" (a fact about the page, not a live
//   message), shown exactly while the registry says `draft`, and printed with an edge because
//   soft fills vanish on paper. Header, language switch and footer are hidden in print.
// - «Контакти» closes the document under a hairline: the one mailto: for privacy requests and
//   complaints, omitted when LEGAL_CONTACT_EMAIL is unset (possible only with drafts allowed).
//   The same address fills the texts' `[LEGAL_CONTACT_EMAIL]` placeholders (left as written
//   when unset).
// - The way back (owner 2026-10-05): every legal link opens in a new tab, and the wordmark leads
//   to `/`, which sends a signed-in admin on to `/app`. The footer leaves the current document
//   out rather than link to itself.

const TITLE_KEY = { TERMS: 'terms.title', PRIVACY: 'privacy.title' } as const;
const DESCRIPTION_KEY = { TERMS: 'terms.description', PRIVACY: 'privacy.description' } as const;

type Params = Promise<{ document: string }>;

function resolveDocument(slug: string): LegalDocumentKey {
  const document = legalDocumentFromSlug(slug);
  if (document === null) notFound();
  return document;
}

/** Indexable: the legal pages are the one public text of the site (the guest pages are not). */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const document = resolveDocument((await params).document);
  const t = await getTranslations('legal');
  return { title: t(TITLE_KEY[document]), description: t(DESCRIPTION_KEY[document]) };
}

export default async function LegalDocumentPage({ params }: { params: Params }) {
  const document = resolveDocument((await params).document);
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const contactEmail = getWebEnv().LEGAL_CONTACT_EMAIL;
  const [{ meta, html }, t] = await Promise.all([
    loadLegalDocument(document, locale, contactEmail),
    getTranslations('legal'),
  ]);
  return (
    <div className="flex min-h-dvh flex-col bg-background print:bg-white">
      <SiteHeader>
        <div className="print:hidden">
          <LanguageSwitch variant="header" />
        </div>
      </SiteHeader>
      <main className="stepler-container flex-1 pt-6 pb-16 sm:pt-10 lg:pt-12 print:pt-0 print:pb-0">
        {/* A centred reading column (owner 2026-10-06). */}
        <div className="mx-auto grid w-full max-w-[68ch] gap-6">
          <div className="grid gap-2">
            <h1 className="type-h1">{t(TITLE_KEY[document])}</h1>
            <LegalMeta meta={meta} />
          </div>
          {meta.draft ? <DraftBanner /> : null}
          <LegalArticle html={html} />
          {contactEmail === undefined ? null : <ContactBlock email={contactEmail} />}
        </div>
      </main>
      <div className="print:hidden">
        <SiteFooter currentDocument={document} />
      </div>
    </div>
  );
}
