'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { PermissionChips } from '@/guest-links/permission-chips';
import { CollectionCoverImage } from './collection-cover-image';
import { ShareButton } from './collections/[id]/share-dialog';
import { CollectionQuickActions } from './collections/collection-actions';

/**
 * The table's columns (V1, DESIGN-SYSTEM.md §0.8), set inside a `@container/table` element as
 * `--table-cols` and shared by the header and every row. They follow the table's own width, not
 * the window's: a folded sidebar gives the table room for more. Narrow: collection, frames,
 * status, actions; from 56rem what guests may add; from 68rem the date.
 */
export const TABLE_COLUMNS = cn(
  '[--table-cols:minmax(0,1fr)_8rem_10rem_9.5rem]',
  '@min-[56rem]/table:[--table-cols:minmax(0,1fr)_13rem_8rem_10rem_9.5rem]',
  '@min-[68rem]/table:[--table-cols:minmax(0,1fr)_14.5rem_8.5rem_7.5rem_10.5rem_9.5rem]',
);

/** A cell shown only once the table is wide enough for its column. */
const FROM_CHIPS = 'hidden @min-[56rem]/table:flex';
const FROM_DATE = 'hidden @min-[68rem]/table:flex';

const ROW = cn(
  'group relative grid grid-cols-(--table-cols) items-center gap-x-4 border-t py-3 pr-2.5 pl-3.5 text-[0.8125rem]',
  'transition-colors duration-(--duration-fast) hover:bg-subtle motion-reduce:transition-none',
  // The title link covers the row; its focus draws the ring around the whole row.
  'has-[[data-slot=collection-link]:focus-visible]:z-1 has-[[data-slot=collection-link]:focus-visible]:outline-2 has-[[data-slot=collection-link]:focus-visible]:-outline-offset-2 has-[[data-slot=collection-link]:focus-visible]:outline-ring has-[[data-slot=collection-link]:focus-visible]:outline-solid',
);

const ABOVE_LINK = 'relative z-1';

/** The table's column names: seen, not read (each cell says what it is). */
export function CollectionTableHeader() {
  const t = useTranslations('collections.columns');
  return (
    <div
      aria-hidden="true"
      className="grid h-8 grid-cols-(--table-cols) items-center gap-x-4 rounded-t-sheet bg-subtle pr-2.5 pl-3.5 text-xs font-medium text-muted-foreground"
    >
      <span>{t('collection')}</span>
      <span className={FROM_CHIPS}>{t('guestsAdd')}</span>
      <span>{t('frames')}</span>
      <span className={FROM_DATE}>{t('date')}</span>
      <span>{t('status')}</span>
      <span />
    </div>
  );
}

/** Two lines in a cell: the value, and a muted note under it. */
function Stack({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-foreground">{children}</span>
      {note === undefined || note === null ? null : (
        <span className="truncate text-xs text-muted-foreground">{note}</span>
      )}
    </span>
  );
}

/**
 * One collection as a 64px table row (V1, owner 2026-10-06): the cover (or initials), title and
 * description; what guests may add through the main link; frames in mono with the last arrival;
 * the date; the status with the link state; «Поділитися» on active rows and the «⋯» menu (the
 * same items as the card's). The title link is stretched over the row, so a click anywhere opens
 * the collection; the controls sit above it.
 */
export function CollectionRow({ collection }: { collection: Collection }) {
  const t = useTranslations('collections');
  const tCard = useTranslations('collections.card');
  const format = useFormatter();
  const archived = collection.status === 'ARCHIVED';
  const status = t(`statusChip.${collection.status}`);
  const date = format.dateTime(new Date(collection.archivedAt ?? collection.createdAt), 'short');
  const [count, ...word] = tCard('frames', { count: collection.contentCount }).split(' ');
  const last =
    collection.lastContentAt === null
      ? null
      : tCard('lastAt', {
          time: format.dateTime(new Date(collection.lastContentAt), {
            hour: '2-digit',
            minute: '2-digit',
          }),
        });

  return (
    <li
      data-slot="collection-card"
      data-view="table"
      data-status={collection.status}
      className={ROW}
    >
      <div className="flex min-w-0 items-center gap-3">
        <CollectionCoverImage
          collection={collection}
          size="sm"
          className={cn('size-10 rounded-control text-sm', archived && 'saturate-[.45]')}
        />
        <div className="min-w-0">
          <Link
            data-slot="collection-link"
            href={`/app/collections/${collection.id}`}
            title={collection.title}
            className={cn(
              'block truncate text-sm font-semibold no-underline outline-none after:absolute after:inset-0 after:content-[""] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4',
              archived ? 'text-foreground-soft' : 'text-foreground',
            )}
          >
            {collection.title}
          </Link>
          <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
            {collection.description ?? t('noDescription')}
          </p>
        </div>
      </div>

      <div className={cn(FROM_CHIPS, 'min-w-0')}>
        {!archived && collection.defaultLinkPermissions !== null ? (
          <PermissionChips permissions={collection.defaultLinkPermissions} size="compact" />
        ) : null}
      </div>

      {/* The date and the link state are what the card calls its meta line. */}
      <div data-slot="collection-meta" className="contents">
        <Stack note={archived ? null : last}>
          <span className="font-mono text-[0.8125rem] tabular-nums">{count}</span> {word.join(' ')}
        </Stack>
        <span className={cn(FROM_DATE, 'min-w-0')}>
          <Stack note={t(`dateLabel.${collection.status}`)}>{date}</Stack>
        </span>
        <span className="flex min-w-0 flex-col items-start gap-1">
          <Badge variant={archived ? 'neutral' : 'success'} title={status}>
            {status}
          </Badge>
          {archived ? (
            <span className="truncate text-xs text-muted-foreground">{t('guestsClosed')}</span>
          ) : collection.defaultLinkStatus === null ? null : (
            <span
              data-slot="collection-link-status"
              data-status={collection.defaultLinkStatus}
              className="truncate text-xs text-muted-foreground"
            >
              {collection.defaultLinkStatus === 'ACTIVE' ? t('linkActive') : t('linkPaused')}
            </span>
          )}
        </span>
      </div>

      <div className={cn(ABOVE_LINK, 'flex items-center justify-end gap-1')}>
        {archived ? null : (
          <ShareButton collection={collection} variant="outline" size="sm">
            {tCard('share')}
          </ShareButton>
        )}
        <CollectionQuickActions collection={collection} />
      </div>
    </li>
  );
}
