import { EmptyState } from '@stepler/ui/components/empty-state';
import { PageHeader } from '@stepler/ui/components/page-header';
import { getTranslations } from 'next-intl/server';

// Placeholder dashboard until collections arrive (Phase 4).
export default async function AppHomePage() {
  const t = await getTranslations('app');
  return (
    <main className="stepler-container grid gap-8 pt-8 pb-16 lg:pt-10 lg:pb-20">
      <PageHeader size="compact" title={t('placeholderTitle')} />
      <div className="rounded-2xl border bg-card shadow-xs">
        <EmptyState
          frameNumber={1}
          title={t('emptyTitle')}
          description={t('emptyText')}
          className="py-14"
        />
      </div>
    </main>
  );
}
