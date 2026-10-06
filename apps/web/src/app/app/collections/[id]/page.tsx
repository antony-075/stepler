import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminPage } from '@/components/admin-page';
import { getWebEnv } from '@/env';
import { CollectionOverview } from './collection-overview';

// A generic title: the collection is fetched in the browser, not on the server.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('collection');
  return { title: t('pageTitle') };
}

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminPage>
      <CollectionOverview id={id} contactEmail={getWebEnv().LEGAL_CONTACT_EMAIL ?? null} />
    </AdminPage>
  );
}
