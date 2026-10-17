import type { LegalDocumentKey } from '@stepler/contracts';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LegalLinks } from '@/legal/legal-links';

/**
 * The copyright line, «Тарифи» and the legal links («Умови використання», «Політика конфіденційності»)
 * on one wrapping row; `container` is the page column (the landing passes its wider one). A legal
 * page passes its own document as `currentDocument`, which the footer then leaves out.
 */
export function SiteFooter({
  container = 'stepler-container',
  currentDocument,
  onPricing = false,
}: {
  container?: string;
  currentDocument?: LegalDocumentKey;
  /** `/pricing` itself: no link to the page it is on. */
  onPricing?: boolean;
}) {
  const t = useTranslations('brand');
  const tLanding = useTranslations('landing');
  return (
    <footer className="border-t py-3 text-sm text-muted-foreground">
      <div className={cn(container, 'flex flex-wrap items-center justify-between gap-x-6')}>
        <p className="py-2.5">{t('copyright', { year: 2026 })}</p>
        <div className="flex flex-wrap items-center gap-x-6">
          {onPricing ? null : (
            <Link
              href="/pricing"
              className={cn(
                'inline-flex min-h-11 items-center rounded-control text-muted-foreground underline-offset-4 hover:text-foreground hover:underline',
                focusRing,
              )}
            >
              {tLanding('pricingLink')}
            </Link>
          )}
          <LegalLinks variant="footer" current={currentDocument} />
        </div>
      </div>
    </footer>
  );
}
