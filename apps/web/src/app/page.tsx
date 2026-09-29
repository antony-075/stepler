import { getTranslations } from 'next-intl/server';

// Placeholder landing; replaced in Phase 3/4.
export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="text-lg">{t('tagline')}</p>
    </main>
  );
}
