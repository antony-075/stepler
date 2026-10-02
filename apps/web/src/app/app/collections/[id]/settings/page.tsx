import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminPage } from '@/components/admin-page';
import { CollectionSettings } from './collection-settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('collection.settingsPage');
  return { title: t('pageTitle') };
}

export default async function CollectionSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminPage>
      <CollectionSettings id={id} />
    </AdminPage>
  );
}
