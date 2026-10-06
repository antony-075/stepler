'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatBytes } from '@/format/bytes';
import { PermissionChips } from '@/guest-links/permission-chips';
import { CollectionCoverImage } from './collection-cover-image';
import { ShareIconButton } from './collections/[id]/share-dialog';
import { CollectionQuickActions } from './collections/collection-actions';

/**
 * The table's columns (V1, DESIGN-SYSTEM.md §0.8; owner 2026-10-06: one value per column), set
 * inside a `@container/table` element as `--table-cols` and shared by the header and every row.
 * They follow the table's own width, not the window's (a folded sidebar gives the table more).
 * Every column is left-aligned, headers and values alike (owner 2026-10-06); numbers are mono.
 * Narrow: collection, frames, status, actions; then what guests may add (52rem, icons), the created
 * date (60rem), the size (68rem) and the latest frame (78rem): the latest frame goes first when
 * room runs out, then the size, then the date. From 86rem the chips have their labels.
 */
export const TABLE_COLUMNS = cn(
  '[--table-cols:minmax(0,1fr)_4.5rem_10rem_5.5rem]',
  '@min-[52rem]/table:[--table-cols:minmax(0,1fr)_7.5rem_4.5rem_10rem_5.5rem]',
  '@min-[60rem]/table:[--table-cols:minmax(0,1fr)_7.5rem_4.5rem_7.5rem_10rem_5.5rem]',
  '@min-[68rem]/table:[--table-cols:minmax(0,1fr)_7.5rem_4.5rem_5.5rem_7.5rem_10rem_5.5rem]',
  '@min-[78rem]/table:[--table-cols:minmax(0,1fr)_7.5rem_4.5rem_5.5rem_8.5rem_7.5rem_10rem_5.5rem]',
  '@min-[86rem]/table:[--table-cols:minmax(16rem,1fr)_20rem_4.5rem_5.5rem_8.5rem_7.5rem_10.5rem_5.5rem]',
);

/** Cells shown only once the table is wide enough for their column. */
const FROM_CHIPS = 'hidden @min-[52rem]/table:flex';
const FROM_CREATED = 'hidden @min-[60rem]/table:block';
const FROM_SIZE = 'hidden @min-[68rem]/table:block';
const FROM_LAST = 'hidden @min-[78rem]/table:block';

const ROW = cn(
  'group relative grid min-h-[4.75rem] grid-cols-(--table-cols) items-center gap-x-4 border-t py-3.5 pr-2.5 pl-4 text-[0.875rem]',
  'transition-colors duration-(--duration-fast) hover:bg-subtle motion-reduce:transition-none',
  // The title link covers the row; its focus draws the ring around the whole row.
  'has-[[data-slot=collection-link]:focus-visible]:z-1 has-[[data-slot=collection-link]:focus-visible]:outline-2 has-[[data-slot=collection-link]:focus-visible]:-outline-offset-2 has-[[data-slot=collection-link]:focus-visible]:outline-ring has-[[data-slot=collection-link]:focus-visible]:outline-solid',
);

/** Numbers: mono with tabular figures, left-aligned like every column. */
const NUMBER = 'font-mono text-[0.875rem] tabular-nums';

const ABOVE_LINK = 'relative z-1';

/** The table's column names: seen, not read (each cell carries its name for screen readers). */
export function CollectionTableHeader() {
  const t = useTranslations('collections.columns');
  return (
    <div
      aria-hidden="true"
      className="grid h-9 grid-cols-(--table-cols) items-center gap-x-4 rounded-t-sheet bg-subtle pr-2.5 pl-4 text-xs font-medium text-muted-foreground"
    >
      <span>{t('collection')}</span>
      <span className={FROM_CHIPS}>{t('guestsAdd')}</span>
      <span>{t('frames')}</span>
      <span className={FROM_SIZE}>{t('size')}</span>
      <span className={FROM_LAST}>{t('last')}</span>
      <span className={FROM_CREATED}>{t('created')}</span>
      <span>{t('status')}</span>
      <span />
    </div>
  );
}

/** A cell's value with its column's name for screen readers (the header row is not read). */
function Cell({
  name,
  className,
  children,
}: {
  name: string;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations('collections');
  return (
    <span className={cn('min-w-0 truncate', className)}>
      <span className="sr-only">{t('cellName', { name })} </span>
      {children}
    </span>
  );
}

/**
 * One collection as a 76px table row (V1, owner 2026-10-06): the cover (or initials), title and
 * description; what guests may add through the main link; the frame count, the content's size,
 * the latest frame's time and the created date, one value each; the collection's status and the
 * main link's state as badges; «Поділитися» (an icon) on active rows and the «⋯» menu (the same
 * items as the card's). The title link is stretched over the row, so a click anywhere opens the
 * collection; the controls sit above it.
 */
export function CollectionRow({ collection }: { collection: Collection }) {
  const t = useTranslations('collections');
  const tColumns = useTranslations('collections.columns');
  const tCard = useTranslations('collections.card');
  const format = useFormatter();
  const archived = collection.status === 'ARCHIVED';
  const status = t(`statusChip.${collection.status}`);
  const created = format.dateTime(new Date(collection.createdAt), 'short');
  const last =
    collection.lastContentAt === null
      ? null
      : format.dateTime(new Date(collection.lastContentAt), {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
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
          className={cn('size-11 rounded-control text-sm', archived && 'saturate-[.45]')}
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
          <p className="mt-1 truncate text-[0.875rem] text-muted-foreground">
            {collection.description ?? t('noDescription')}
          </p>
        </div>
      </div>

      <div className={cn(FROM_CHIPS, 'min-w-0')}>
        {!archived && collection.defaultLinkPermissions !== null ? (
          <PermissionChips permissions={collection.defaultLinkPermissions} size="icons" />
        ) : null}
      </div>

      {/* What the card calls its meta line: the numbers, the dates and the link's state. */}
      <div data-slot="collection-meta" className="contents">
        <Cell name={tColumns('frames')} className={NUMBER}>
          {format.number(collection.contentCount)}
        </Cell>
        <Cell name={tColumns('size')} className={cn(FROM_SIZE, NUMBER)}>
          <span data-slot="collection-size">
            {collection.storageBytes > 0
              ? formatBytes(format.number, collection.storageBytes)
              : t('none')}
          </span>
        </Cell>
        <Cell name={tColumns('last')} className={cn(FROM_LAST, 'tabular-nums')}>
          {last ?? t('none')}
        </Cell>
        <Cell name={tColumns('created')} className={cn(FROM_CREATED, 'tabular-nums')}>
          {created}
        </Cell>
        <span className="flex min-w-0 flex-col items-start gap-1.5">
          <Badge variant={archived ? 'neutral' : 'success'} title={status}>
            {status}
          </Badge>
          {archived ? (
            <span className="truncate text-xs text-muted-foreground">{t('guestsClosed')}</span>
          ) : (
            <LinkStatusBadge status={collection.defaultLinkStatus} />
          )}
        </span>
      </div>

      <div className={cn(ABOVE_LINK, 'flex items-center justify-end gap-0.5')}>
        {archived ? null : <ShareIconButton collection={collection} label={tCard('share')} />}
        <CollectionQuickActions collection={collection} />
      </div>
    </li>
  );
}

/**
 * The main link's state as a badge beside the collection's (owner 2026-10-06): green while guests
 * can use it, amber while it is paused; nothing without a live main link.
 */
export function LinkStatusBadge({ status }: { status: Collection['defaultLinkStatus'] }) {
  const t = useTranslations('collections');
  if (status === null) return null;
  const label = status === 'ACTIVE' ? t('linkActive') : t('linkPaused');
  return (
    <Badge
      data-slot="collection-link-status"
      data-status={status}
      variant={status === 'ACTIVE' ? 'success' : 'warning'}
      title={label}
    >
      {label}
    </Badge>
  );
}
