import type { LegalDocumentKey } from '@stepler/contracts';
import { cn } from '@stepler/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { LegalLinks } from '@/legal/legal-links';

/**
 * The copyright line and the legal links («Умови використання», «Політика конфіденційності»)
 * on one wrapping row; `container` is the page column (the landing passes its wider one). A legal
 * page passes its own document as `currentDocument`, which the footer then leaves out.
 */
export function SiteFooter({
  container = 'stepler-container',
  currentDocument,
}: {
  container?: string;
  currentDocument?: LegalDocumentKey;
}) {
  const t = useTranslations('brand');
  return (
    <footer className="border-t py-3 text-sm text-muted-foreground">
      <div className={cn(container, 'flex flex-wrap items-center justify-between gap-x-6')}>
        <p className="py-2.5">{t('copyright', { year: 2026 })}</p>
        <LegalLinks variant="footer" current={currentDocument} />
      </div>
    </footer>
  );
}
