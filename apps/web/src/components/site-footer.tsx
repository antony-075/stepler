import { useTranslations } from 'next-intl';

export function SiteFooter() {
  const t = useTranslations('brand');
  return (
    <footer className="border-t px-4 py-4 text-sm text-muted-foreground sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1240px]">{t('copyright', { year: 2026 })}</div>
    </footer>
  );
}
