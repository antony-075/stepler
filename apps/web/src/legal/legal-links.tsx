import type { LegalDocumentKey } from '@stepler/contracts';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { legalPath } from './slugs';

type LegalLinksProps = {
  className?: string;
  /** `footer`: the page footer's small links. `nav`: the quiet line at the bottom of the admin sidebar. */
  variant?: 'footer' | 'nav';
  /** The document this page shows (the legal pages): left out, so the footer never links to itself. */
  current?: LegalDocumentKey;
};

/** `shortKey`: the `nav` variant's label (owner 2026-10-05: the full titles wrap in the sidebar). */
const DOCUMENTS = [
  { document: 'TERMS', key: 'terms.title', shortKey: 'terms.short' },
  { document: 'PRIVACY', key: 'privacy.title', shortKey: 'privacy.short' },
] as const;

/**
 * Joins the sidebar's links (decorative, `aria-hidden`). It trails the first link, so a line too
 * narrow for both wraps without a leading dot.
 */
const SEPARATOR = '·';
/** Hit height: 44px rows in the footer, 24px for the sidebar's secondary links. */
const ROW_HEIGHT = { footer: 'min-h-11', nav: 'min-h-6' } as const;

/**
 * «Умови використання» · «Політика конфіденційності» as a labelled `nav`. Synchronous, so the
 * server footers and the client admin shell both render it. Every link opens in a new tab (owner
 * 2026-10-05) so reading a document never loses the page you were on, with a screen-reader note
 * saying so; the legal pages have no history-back button (it breaks on direct visits).
 * - `footer`: the footer's 14px links in 44px rows.
 * - `nav`: short labels («Умови · Конфіденційність», one line in the 240px sidebar) in 12px muted
 *   text joined by «·», 24px tall (WCAG 2.5.8, secondary links), starting at the nav items' text
 *   edge (their 1px border + 12px padding). The accessible name still names the full document.
 */
export function LegalLinks({ className, variant = 'footer', current }: LegalLinksProps) {
  const t = useTranslations('legal');
  const nav = variant === 'nav';
  const documents = DOCUMENTS.filter(({ document }) => document !== current);
  return (
    <nav aria-label={t('navLabel')} className={className}>
      <ul className={cn('flex flex-wrap items-center', nav ? 'px-2.5 text-xs' : 'gap-x-5 text-sm')}>
        {documents.map(({ document, key, shortKey }, index) => (
          <li key={document} className="flex items-center">
            <a
              href={legalPath(document)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={nav ? t('newTabName', { title: t(key) }) : undefined}
              className={cn(
                'inline-flex items-center rounded-control text-muted-foreground no-underline underline-offset-4 transition-colors duration-(--duration-fast) hover:text-foreground hover:underline motion-reduce:transition-none',
                ROW_HEIGHT[variant],
                focusRing,
              )}
            >
              {nav ? (
                t(shortKey)
              ) : (
                <>
                  {t(key)}
                  <span className="sr-only"> {t('opensInNewTab')}</span>
                </>
              )}
            </a>
            {nav && index < documents.length - 1 ? (
              <span aria-hidden="true" className="px-1.5 text-muted-foreground select-none">
                {SEPARATOR}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
