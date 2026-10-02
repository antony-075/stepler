import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminPage } from '@/components/admin-page';
import { CollectionsDashboard } from './collections-dashboard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('collections');
  return { title: t('pageTitle') };
}

/** The admin's collections: the active ones, then the archive. */
export default function AppHomePage() {
  return (
    <AdminPage>
      <CollectionsDashboard />
    </AdminPage>
  );
}
