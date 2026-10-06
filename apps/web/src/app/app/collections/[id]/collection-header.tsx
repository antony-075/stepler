'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { useFormatter, useTranslations } from 'next-intl';
import { CollectionBreadcrumbs } from '@/components/breadcrumbs';
import { CollectionCoverImage } from '../../collection-cover-image';
import { ShareButton } from './share-dialog';
import { EditableDescription, EditableTitle } from './inline-edit';

/**
 * The collection page's header (DESIGN-SYSTEM.md §0.9; owner reviews 2026-10-02): the
 * breadcrumbs («Колекції › {title}»), the title as h1 and the description, each edited in place
 * with a visible pencil (read-only when archived), and the status and date. No actions menu:
 * sharing is per link, archive and delete are on the «Параметри колекції» tab.
 *
 * `layout="nav"` (from 1440px, V1): the top of the collection's mini-nav, in a 248px column: the
 * cover, the title and description, the status with the date, and «Поділитися» (the main link's
 * QR and link; active collections only).
 */
export function CollectionHeader({
  collection,
  layout = 'page',
}: {
  collection: Collection;
  layout?: 'page' | 'nav';
}) {
  const tList = useTranslations('collections');
  const format = useFormatter();
  const archived = collection.status === 'ARCHIVED';
  const status = tList(`status.${collection.status}`);
  const date = format.dateTime(new Date(collection.archivedAt ?? collection.createdAt), 'short');
  const dated = archived ? tList('archivedOn', { date }) : tList('createdOn', { date });
  const badge = (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted-foreground">
      <Badge variant={archived ? 'neutral' : 'success'} title={status}>
        {status}
      </Badge>
      <span className="text-[0.8125rem] tabular-nums">{dated}</span>
    </p>
  );

  if (layout === 'nav') {
    return (
      <header data-slot="page-header" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5">
        <CollectionBreadcrumbs collection={collection} nowrap />
        <CollectionCoverImage
          collection={collection}
          size="sm"
          className="size-10 rounded-control text-sm"
        />
        <div className="-mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)]">
          <EditableTitle collection={collection} size="nav" />
          <EditableDescription collection={collection} size="nav" />
        </div>
        {badge}
        {archived ? null : (
          <ShareButton collection={collection} className="w-full">
            {tList('card.share')}
          </ShareButton>
        )}
      </header>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <header data-slot="page-header" className="grid grid-cols-[minmax(0,1fr)] gap-1">
        <CollectionBreadcrumbs collection={collection} />
        <EditableTitle collection={collection} />
        {/* The description and the status share one line where there is room. */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 lg:flex lg:flex-wrap lg:items-center lg:gap-x-5">
          <EditableDescription collection={collection} />
          {badge}
        </div>
      </header>
    </div>
  );
}
