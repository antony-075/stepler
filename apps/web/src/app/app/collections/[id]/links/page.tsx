import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminPage } from '@/components/admin-page';
import { CollectionLinks } from './collection-links';

// A generic title: the collection is fetched in the browser, not on the server.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('links');
  return { title: t('pageTitle') };
}

export default async function CollectionLinksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminPage>
      <CollectionLinks id={id} />
    </AdminPage>
  );
}
