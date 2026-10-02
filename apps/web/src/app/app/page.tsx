import { EmptyState } from '@stepler/ui/components/empty-state';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Panel } from '@stepler/ui/components/panel';
import { getTranslations } from 'next-intl/server';

// Placeholder dashboard until collections arrive (Phase 4): an empty sheet waiting for its first
// frame, as an empty collection will look (DESIGN-SYSTEM.md §5.16).
export default async function AppHomePage() {
  const t = await getTranslations('app');
  return (
    <main className="stepler-container grid gap-6 pt-8 pb-16 lg:gap-8 lg:pt-10 lg:pb-20">
      <PageHeader size="compact" title={t('placeholderTitle')} />
      <Panel variant="sheet">
        <EmptyState
          frameNumber={1}
          title={t('emptyTitle')}
          description={t('emptyText')}
          className="py-12 sm:py-16"
        />
      </Panel>
    </main>
  );
}
