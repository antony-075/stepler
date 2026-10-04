'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { useFormatter, useTranslations } from 'next-intl';
import { CollectionBreadcrumbs } from '@/components/breadcrumbs';
import { EditableDescription, EditableTitle } from './inline-edit';

/**
 * The collection page's header (DESIGN-SYSTEM.md §6.6; owner reviews 2026-10-02): the breadcrumbs
 * («Колекції › {title}»), the title as h1 and the description, each edited in place with a
 * visible pencil (read-only when archived), and the status and date. No actions menu: sharing is
 * per link, archive and delete are on the «Параметри колекції» tab.
 */
export function CollectionHeader({ collection }: { collection: Collection }) {
  const tList = useTranslations('collections');
  const format = useFormatter();
  const archived = collection.status === 'ARCHIVED';
  const status = tList(`status.${collection.status}`);
  const date = format.dateTime(new Date(collection.archivedAt ?? collection.createdAt), 'short');
  const dated = archived ? tList('archivedOn', { date }) : tList('createdOn', { date });

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <header data-slot="page-header" className="grid grid-cols-[minmax(0,1fr)] gap-1">
        <CollectionBreadcrumbs collection={collection} />
        <EditableTitle collection={collection} />
        <EditableDescription collection={collection} />
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <Badge variant={archived ? 'neutral' : 'success'} title={status}>
            {status}
          </Badge>
          <span className="text-sm tabular-nums">{dated}</span>
        </p>
      </header>
    </div>
  );
}
