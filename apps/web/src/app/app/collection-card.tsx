'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { TintTile } from '@stepler/ui/components/tint-tile';
import { cn } from '@stepler/ui/lib/utils';
import { CalendarDays, Images, Link2 } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { PermissionChips } from '@/guest-links/permission-chips';
import { collectionInitials } from './collection-initials';
import { collectionTint } from './collection-tint';
import { ShareButton } from './collections/[id]/share-dialog';
import { CollectionQuickActions } from './collections/collection-actions';

// The title link is stretched over the card with `::after`, so a tap anywhere opens the
// collection while its accessible name stays the title. Controls sit above it (`relative z-1`).
// Keyboard focus on the title draws the violet ring around the whole card.
const CARD = cn(
  'group relative grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 gap-y-4 rounded-sheet border bg-card p-4 shadow-card sm:gap-x-6 sm:p-5',
  'transition-colors duration-(--duration-fast) hover:border-input hover:shadow-card-hover motion-reduce:transition-none',
  'has-[[data-slot=collection-link]:focus-visible]:outline-2 has-[[data-slot=collection-link]:focus-visible]:outline-offset-2 has-[[data-slot=collection-link]:focus-visible]:outline-ring has-[[data-slot=collection-link]:focus-visible]:outline-solid',
);

const ABOVE_LINK = 'relative z-1';

/**
 * One collection on the dashboard (DESIGN-SYSTEM.md §6.5; the owner's reference 2026-10-02):
 * the cover (its initials in its own tint until it has content; a cover photo replaces the tile
 * later, at the same size), the title, the description, what guests may add through the main
 * link (chips from its real permissions), then a quiet line with the date and the main link's
 * state. On the right: the status and one everyday action, «Поділитися» (the share dialog: the
 * main link's QR with its download, the link with Copy and Open, its state; owner 2026-10-02:
 * two buttons looked like one thing; hidden for archived collections); «⋯» right of the status
 * holds archive (or bring back) and delete. The meta line counts frames once there are any.
 *
 * Phones: the cover (80px) beside the title and status, everything else under them at full
 * width, «Поділитися» last at full width. From `md`: cover | content | status and the action.
 */
export function CollectionCard({ collection }: { collection: Collection }) {
  const t = useTranslations('collections');
  const tCard = useTranslations('collections.card');
  const format = useFormatter();
  const archived = collection.status === 'ARCHIVED';
  const status = t(`statusChip.${collection.status}`);
  const date = format.dateTime(new Date(collection.archivedAt ?? collection.createdAt), 'short');
  const linkActive = collection.defaultLinkStatus === 'ACTIVE';
  const linkIconTone = linkActive ? 'text-success' : 'text-warning';

  return (
    <article
      data-slot="collection-card"
      data-status={collection.status}
      className={cn(CARD, { 'bg-transparent': archived })}
    >
      <TintTile
        tint={collectionTint(collection.id)}
        size="cover"
        className="col-[1] row-[1/span_2]"
      >
        <span translate="no">{collectionInitials(collection.title)}</span>
      </TintTile>

      <h3 className="type-h2 col-[2] row-[1] min-w-0 self-end [overflow-wrap:anywhere] md:self-start">
        <Link
          data-slot="collection-link"
          href={`/app/collections/${collection.id}`}
          title={collection.title}
          className="line-clamp-3 text-foreground no-underline decoration-1 underline-offset-4 outline-none group-hover:underline after:absolute after:inset-0 after:content-['']"
        >
          {collection.title}
        </Link>
      </h3>

      {/* The status tag and «⋯» (owner 2026-10-02: the menu right of the status). Phones: the tag
          under the title and the menu top right, each placed on its own; from `md` together. */}
      <div className="contents md:col-[3] md:row-[1] md:flex md:items-center md:justify-end md:gap-1">
        <Badge
          variant={archived ? 'neutral' : 'success'}
          title={status}
          className="col-[2] row-[2] self-start justify-self-start md:self-auto"
        >
          {status}
        </Badge>
        <CollectionQuickActions
          collection={collection}
          className={cn(ABOVE_LINK, 'col-[3] row-[1] -mt-1.5 -mr-2 self-start md:mt-0')}
        />
      </div>

      <div className="col-[1/-1] row-[3] grid min-w-0 content-start gap-3 md:col-[2] md:row-[2]">
        {collection.description !== null ? (
          <p className="line-clamp-2 max-w-[72ch] text-[0.9375rem] leading-[1.45] whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">
            {collection.description}
          </p>
        ) : null}
        {!archived && collection.defaultLinkPermissions !== null ? (
          <PermissionChips permissions={collection.defaultLinkPermissions} />
        ) : null}
        <p
          data-slot="collection-meta"
          className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground"
        >
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
            {archived ? t('archivedOn', { date }) : t('createdOn', { date })}
          </span>
          {collection.contentCount === 0 ? null : (
            <span data-slot="collection-content" className="inline-flex items-center gap-1.5">
              <Images aria-hidden="true" className="size-4 shrink-0" />
              <span className="tabular-nums">
                {tCard('frames', { count: collection.contentCount })}
              </span>
              {collection.lastContentAt === null ? null : (
                <span>
                  {tCard('lastAt', {
                    time: format.dateTime(new Date(collection.lastContentAt), {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  })}
                </span>
              )}
            </span>
          )}
          {archived || collection.defaultLinkStatus === null ? null : (
            <span
              data-slot="collection-link-status"
              data-status={collection.defaultLinkStatus}
              className="inline-flex items-center gap-1.5"
            >
              <Link2 aria-hidden="true" className={cn('size-4 shrink-0', linkIconTone)} />
              {linkActive ? t('linkActive') : t('linkPaused')}
            </span>
          )}
        </p>
      </div>

      {/* Archived: nothing to share, so no empty row either. */}
      {archived ? null : (
        <div
          className={cn(
            ABOVE_LINK,
            'col-[1/-1] row-[4] flex gap-2 self-end md:col-[3] md:row-[2] md:justify-end',
          )}
        >
          <ShareButton collection={collection} variant="outline" className="flex-1 md:flex-none">
            {tCard('share')}
          </ShareButton>
        </div>
      )}
    </article>
  );
}
