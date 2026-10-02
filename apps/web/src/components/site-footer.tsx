import { cn } from '@stepler/ui/lib/utils';
import { useTranslations } from 'next-intl';

/** The copyright line; `container` is the page column (the landing passes its wider one). */
export function SiteFooter({ container = 'stepler-container' }: { container?: string }) {
  const t = useTranslations('brand');
  return (
    <footer className="border-t py-4 text-sm text-muted-foreground">
      <div className={cn(container)}>{t('copyright', { year: 2026 })}</div>
    </footer>
  );
}
