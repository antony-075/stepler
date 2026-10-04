import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { legalPath } from './slugs';

type LegalLinksProps = {
  className?: string;
  /** Opens the documents in a new tab (the guest page, the sign-in card): never loses the page's state. */
  newTab?: boolean;
  /** `footer`: one wrapping line of small links. `nav`: 44px rows at the bottom of the admin sidebar. */
  variant?: 'footer' | 'nav';
};

const DOCUMENTS = [
  { document: 'TERMS', key: 'terms.title' },
  { document: 'PRIVACY', key: 'privacy.title' },
] as const;

/**
 * «Умови використання» · «Політика конфіденційності» as a labelled `nav`. Synchronous, so the
 * server footers and the client admin shell both render it. Touch targets stay 44px in both
 * variants; in the footer the row is simply a little taller than its text.
 */
export function LegalLinks({ className, newTab = false, variant = 'footer' }: LegalLinksProps) {
  const t = useTranslations('legal');
  const nav = variant === 'nav';
  return (
    <nav aria-label={t('navLabel')} className={className}>
      <ul className={cn(nav ? 'grid gap-1' : 'flex flex-wrap gap-x-5')}>
        {DOCUMENTS.map(({ document, key }) => (
          <li key={document}>
            <Link
              href={legalPath(document)}
              {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className={cn(
                'inline-flex min-h-11 items-center rounded-control text-muted-foreground no-underline transition-colors duration-(--duration-fast) hover:text-foreground motion-reduce:transition-none',
                { 'flex px-3 text-sm': nav, 'underline-offset-4 hover:underline': !nav },
                focusRing,
              )}
            >
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
