'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Settings } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { BackLink } from '@/components/back-link';
import { CollectionNav } from './collection-nav';

// The collection's name is the page's h1 at the admin scale, but capped at 32px from `xl`
// (DESIGN-SYSTEM.md §3.2: "название в коллекции 32").
export const COLLECTION_TITLE = 'xl:[&_[data-slot=page-header-title]]:text-[2rem]';

/**
 * The header every page of a collection shares (DESIGN-SYSTEM.md §6.6): back to the collections,
 * the title as h1, status and date, the page's actions and «Налаштування», `children` (the
 * overview's description) and the section nav (G9).
 */
export function CollectionHeader({
  collection,
  current,
  actions,
  children,
}: {
  collection: Collection;
  current: 'content' | 'links';
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const t = useTranslations('collection');
  const tList = useTranslations('collections');
  const format = useFormatter();
  const archived = collection.status === 'ARCHIVED';
  const status = tList(`status.${collection.status}`);
  const date = format.dateTime(new Date(collection.archivedAt ?? collection.createdAt), 'short');
  const dated = archived ? tList('archivedOn', { date }) : tList('createdOn', { date });

  return (
    <div className="grid gap-4">
      <PageHeader
        size="compact"
        className={COLLECTION_TITLE}
        back={<BackLink href="/app">{t('back')}</BackLink>}
        title={collection.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge variant={archived ? 'neutral' : 'success'} title={status}>
              {status}
            </Badge>
            <span className="text-sm tabular-nums">{dated}</span>
          </span>
        }
        actions={
          <>
            {actions}
            {/* Settings are a page of their own, not a tab: one outline button, on every tab. */}
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href={`/app/collections/${collection.id}/settings`} className="no-underline">
                <Settings aria-hidden="true" />
                {t('settings')}
              </Link>
            </Button>
          </>
        }
      />
      {children}
      <CollectionNav id={collection.id} current={current} />
    </div>
  );
}
