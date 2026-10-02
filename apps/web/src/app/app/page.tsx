import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CollectionsDashboard } from './collections-dashboard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('collections');
  return { title: t('pageTitle') };
}

/** The admin's collections: the active ones, then the archive. */
export default function AppHomePage() {
  return (
    <main className="stepler-container grid gap-6 pt-8 pb-16 lg:gap-8 lg:pt-10 lg:pb-20">
      <CollectionsDashboard />
    </main>
  );
}
