import { useTranslations } from 'next-intl';

export function SiteFooter() {
  const t = useTranslations('brand');
  return (
    <footer className="border-t py-4 text-sm text-muted-foreground">
      <div className="stepler-container">{t('copyright', { year: 2026 })}</div>
    </footer>
  );
}
