'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { useFormatter, useTranslations } from 'next-intl';
import { CollectionBreadcrumbs } from '@/components/breadcrumbs';
import { CollectionCoverImage } from '../../collection-cover-image';
import { AccessBadge } from '../../collection-row';
import { ShareButton } from './share-dialog';

/**
 * The collection page's header (DESIGN-SYSTEM.md §0.9; owner reviews 2026-10-02, 2026-10-06): the
 * breadcrumbs («Колекції › {title}»), the title as h1 and the description (nothing when there is
 * none), and the status and date. Read-only: the title and description are edited on the
 * «Параметри колекції» tab, as are archive and delete.
 *
 * `layout="nav"` (from 1440px, V1): the top of the collection's mini-nav, in a 280px column: the
 * cover as a full-width picture, the title and description, the status with the date, and «Поділитися» (the main link's
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
      <AccessBadge collection={collection} />
      <span className="text-[0.875rem] tabular-nums">{dated}</span>
    </p>
  );

  if (layout === 'nav') {
    return (
      <header data-slot="page-header" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5">
        {/* Hands the trail to the top bar (shown there from `lg`; nothing here at this width). */}
        <CollectionBreadcrumbs collection={collection} />
        {/* The collection's face, full width (owner 2026-10-06): its picture, or its initials. */}
        <CollectionCoverImage
          collection={collection}
          size="band"
          className="rounded-sheet text-[2.25rem] shadow-card"
        />
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
          <h1
            data-slot="page-header-title"
            className="text-lg leading-tight font-[650] tracking-[-0.012em] [overflow-wrap:anywhere]"
          >
            {collection.title}
          </h1>
          {collection.description === null ? null : (
            <p className="text-[0.875rem] leading-[1.45] whitespace-pre-line text-foreground-soft [overflow-wrap:anywhere]">
              {collection.description}
            </p>
          )}
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
        <h1 data-slot="page-header-title" className="type-h1 [overflow-wrap:anywhere]">
          {collection.title}
        </h1>
        {collection.description === null ? null : (
          <p className="max-w-[72ch] whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">
            {collection.description}
          </p>
        )}
        <div className="mt-1">{badge}</div>
      </header>
    </div>
  );
}
