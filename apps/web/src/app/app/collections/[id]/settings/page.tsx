import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
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
    <main className="stepler-container pt-5 pb-16 lg:pt-8 lg:pb-20">
      <div className="mx-auto max-w-[640px]">
        <CollectionSettings id={id} />
      </div>
    </main>
  );
}
