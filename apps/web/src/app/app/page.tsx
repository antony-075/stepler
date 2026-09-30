import { getTranslations } from 'next-intl/server';

// Placeholder dashboard until collections arrive (Phase 4).
export default async function AppHomePage() {
  const t = await getTranslations('app');
  return (
    <main className="stepler-container grid gap-2 py-8">
      <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
        {t('placeholderTitle')}
      </h1>
      <p className="text-muted-foreground">{t('placeholderText')}</p>
    </main>
  );
}
