'use client';

import { PageHeader } from '@stepler/ui/components/page-header';
import { useTranslations } from 'next-intl';
import { BackLink } from '@/components/back-link';

/**
 * A missing, foreign or deleted collection (or a malformed id). One state for all of them, so
 * the page never tells whether someone else's collection exists.
 */
export function CollectionNotFound() {
  const t = useTranslations('collection');
  return (
    <PageHeader
      size="compact"
      back={<BackLink href="/app">{t('back')}</BackLink>}
      title={t('notFoundTitle')}
      description={t('notFoundText')}
    />
  );
}
