'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { PermissionChips } from '@/guest-links/permission-chips';
import { CollectionCoverImage } from './collection-cover-image';
import { formatBytes } from '@/format/bytes';
import { AccessBadge } from './collection-row';
import { ShareIconButton } from './collections/[id]/share-dialog';
import { CollectionQuickActions } from './collections/collection-actions';

// The title link is stretched over the card with `::after`, so a tap anywhere opens the
// collection while its accessible name stays the title. Controls sit above it (`relative z-1`).
// Keyboard focus on the title draws the ring around the whole card.
const CARD = cn(
  'group relative flex min-w-0 flex-col overflow-hidden rounded-sheet border bg-card shadow-card',
  'transition-[border-color,box-shadow] duration-(--duration-fast) hover:border-border-strong hover:shadow-card-hover motion-reduce:transition-none',
  'has-[[data-slot=collection-link]:focus-visible]:outline-2 has-[[data-slot=collection-link]:focus-visible]:outline-offset-2 has-[[data-slot=collection-link]:focus-visible]:outline-ring has-[[data-slot=collection-link]:focus-visible]:outline-solid',
);

const ABOVE_LINK = 'relative z-1';

const TITLE_LINK =
  'text-foreground no-underline outline-none after:absolute after:inset-0 after:content-[""] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4';

/**
 * One collection as a card (V1, DESIGN-SYSTEM.md §0.8): on phones always (`layout="card"`), and as
 * a tile in the dashboard's «Плитки» view from `md` (`layout="tile"`).
 *
 * - `card` (phones): the cover (44px) beside the title and description with «⋯» at the top
 *   right; the status and a meta line (frames, the content's size, date, the main link's state
 *   as a badge); what guests may add and the «Поділитися» icon button (44px) at the bottom.
 *   Archived cards have nothing to share.
 * - `tile`: the cover as a 16:9 band, then the title, description, chips and the meta line,
 *   and a footer with the status, «Поділитися» (an icon with a tooltip) and «⋯».
 *
 * The «⋯» menu holds archive (or bring back) and delete, as before.
 */
export function CollectionCard({
  collection,
  layout = 'card',
}: {
  collection: Collection;
  layout?: 'card' | 'tile';
}) {
  const t = useTranslations('collections');
  const tCard = useTranslations('collections.card');
  const format = useFormatter();
  const archived = collection.status === 'ARCHIVED';
  const status = t(`statusChip.${collection.status}`);
  const date = format.dateTime(new Date(collection.archivedAt ?? collection.createdAt), 'short');
  const [count, ...word] = tCard('frames', { count: collection.contentCount }).split(' ');

  const badge = (
    <Badge variant={archived ? 'neutral' : 'success'} title={status} className="shrink-0">
      {status}
    </Badge>
  );
  const meta = (
    <p
      data-slot="collection-meta"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.875rem] text-muted-foreground"
    >
      <span data-slot="collection-content" className="whitespace-nowrap">
        <span className="font-mono text-xs text-foreground-soft tabular-nums">{count}</span>{' '}
        {word.join(' ')}
      </span>
      {collection.storageBytes > 0 ? (
        <span
          data-slot="collection-size"
          className="font-mono text-xs whitespace-nowrap tabular-nums"
        >
          {formatBytes(format.number, collection.storageBytes)}
        </span>
      ) : null}
      <span className="whitespace-nowrap tabular-nums">
        {archived ? t('archivedOn', { date }) : t('createdOn', { date })}
      </span>
      <AccessBadge collection={collection} />
    </p>
  );
  const chips =
    !archived && collection.defaultLinkPermissions !== null ? (
      <PermissionChips permissions={collection.defaultLinkPermissions} size="compact" />
    ) : null;
  const title = (
    <Link
      data-slot="collection-link"
      href={`/app/collections/${collection.id}`}
      title={collection.title}
      className={TITLE_LINK}
    >
      {collection.title}
    </Link>
  );

  if (layout === 'tile') {
    return (
      <article
        data-slot="collection-card"
        data-view="tiles"
        data-status={collection.status}
        className={cn(CARD, 'h-full')}
      >
        <CollectionCoverImage
          collection={collection}
          size="band"
          className={cn('rounded-none border-b text-[2rem]', archived && 'saturate-[.45]')}
        />
        <div className="grid min-w-0 flex-1 content-start gap-3.5 px-4 pt-4">
          <div className="grid min-w-0 gap-1">
            <h3 className="truncate text-[0.9375rem] font-semibold">{title}</h3>
            <p className="truncate text-[0.875rem] text-muted-foreground">
              {collection.description ?? t('noDescription')}
            </p>
          </div>
          {chips}
          {meta}
        </div>
        <div className="mt-4 flex h-12 items-center gap-1.5 border-t pr-1.5 pl-4">
          {badge}
          <div className={cn(ABOVE_LINK, 'ml-auto flex items-center gap-0.5')}>
            {archived ? null : <ShareIconButton collection={collection} label={tCard('share')} />}
            <CollectionQuickActions collection={collection} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      data-slot="collection-card"
      data-view="card"
      data-status={collection.status}
      className={cn(CARD, 'gap-3 py-3.5 pr-1.5 pl-3.5')}
    >
      <div className="flex min-w-0 items-start gap-3">
        <CollectionCoverImage
          collection={collection}
          size="sm"
          className={cn('rounded-control', archived && 'saturate-[.45]')}
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="line-clamp-2 text-[0.9375rem] leading-snug font-semibold [overflow-wrap:anywhere]">
            {title}
          </h3>
          {collection.description === null ? null : (
            <p className="mt-0.5 truncate text-[0.875rem] text-muted-foreground">
              {collection.description}
            </p>
          )}
        </div>
        <CollectionQuickActions collection={collection} className={cn(ABOVE_LINK, '-mt-1.5')} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 pr-1.5">
        {badge}
        {meta}
      </div>
      {chips === null && archived ? null : (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">{chips}</div>
          {archived ? null : (
            <ShareIconButton
              collection={collection}
              label={tCard('share')}
              className={cn(ABOVE_LINK, 'border border-border-strong text-foreground')}
            />
          )}
        </div>
      )}
    </article>
  );
}
