import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminPage } from '@/components/admin-page';
import { GuestAccess } from './guest-access';

// A generic title: the collection is fetched in the browser, not on the server.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('access');
  return { title: t('pageTitle') };
}

export default async function CollectionAccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminPage>
      <GuestAccess id={id} />
    </AdminPage>
  );
}
