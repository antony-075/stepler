import { getTranslations } from 'next-intl/server';

// Placeholder dashboard until collections arrive (Phase 4).
export default async function AppHomePage() {
  const t = await getTranslations('app');
  return (
    <main className="mx-auto grid max-w-[1240px] gap-2 px-4 py-8 sm:px-6 lg:px-10">
      <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
        {t('placeholderTitle')}
      </h1>
      <p className="text-muted-foreground">{t('placeholderText')}</p>
    </main>
  );
}
