import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CollectionOverview } from './collection-overview';

// A generic title: the collection is fetched in the browser, not on the server.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('collection');
  return { title: t('pageTitle') };
}

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="stepler-container grid gap-8 pt-5 pb-16 lg:pt-8 lg:pb-20">
      <CollectionOverview id={id} />
    </main>
  );
}
