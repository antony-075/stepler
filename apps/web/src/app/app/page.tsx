import { getTranslations } from 'next-intl/server';

// Placeholder dashboard until collections arrive (Phase 4).
export default async function AppHomePage() {
  const t = await getTranslations('app');
  return (
    <main className="mx-auto grid max-w-3xl gap-2 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">{t('placeholderTitle')}</h1>
      <p className="text-muted-foreground">{t('placeholderText')}</p>
    </main>
  );
}
