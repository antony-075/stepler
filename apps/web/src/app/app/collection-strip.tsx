'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { FrameSlots } from '@stepler/ui/components/frame-slots';
import { cn } from '@stepler/ui/lib/utils';
import { Settings } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { collectionTint } from './collection-tint';

/** How many empty frames an active row shows before content exists (slice 7). */
const EMPTY_ROW_FRAMES = 5;

// The whole row is the link to the collection: the title link is stretched over the row with
// `::after`, so a tap anywhere opens it, while the accessible name stays the title alone. The row
// shows hover and the violet focus ring (inset: the sheet clips overflow); the settings button
// sits above the stretched link (`z-1`), so it keeps its own click and focus.
const ROW = cn(
  'group relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-4 p-4 sm:px-6 sm:py-5',
  'transition-colors duration-(--duration-fast) motion-reduce:transition-none',
  'has-[[data-slot=collection-link]:focus-visible]:outline-2 has-[[data-slot=collection-link]:focus-visible]:-outline-offset-2 has-[[data-slot=collection-link]:focus-visible]:outline-ring has-[[data-slot=collection-link]:focus-visible]:outline-solid',
);

/**
 * One active collection on the dashboard (DESIGN-SYSTEM.md §5.10 `CollectionStrip`, §6.5): title,
 * status and date; then the collection's empty frames in its own tint (chosen from its id) with
 * one plain line; the settings button on the right. Before content exists (slice 7) there are no
 * counts, QR or link actions: guest links arrive in slice 2 (plan D6).
 *
 * Phones: summary and settings on the first line, the frames under them across the full width.
 * From `lg` it is one line.
 */
export function CollectionStrip({ collection }: { collection: Collection }) {
  const t = useTranslations('collections');
  return (
    <article
      data-slot="collection-strip"
      className={cn(
        ROW,
        'hover:bg-hover-card lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_auto] lg:items-center lg:gap-x-8',
      )}
    >
      <CollectionSummary
        collection={collection}
        titleClassName="type-h2"
        className="col-start-1 row-start-1"
      />
      <SettingsLink collection={collection} className="col-start-2 row-start-1 lg:col-start-3" />
      <div className="col-span-2 row-start-2 grid gap-3 sm:flex sm:items-center sm:gap-5 lg:col-span-1 lg:col-start-2 lg:row-start-1">
        <FrameSlots
          count={EMPTY_ROW_FRAMES}
          tint={collectionTint(collection.id)}
          className="w-full shrink-0 sm:w-72"
        />
        <p className="max-w-[40ch] text-sm leading-[1.45] text-muted-foreground">{t('emptyRow')}</p>
      </div>
    </article>
  );
}

/**
 * An archived collection: a compact row without frames, on the page itself (the archive list
 * has a dashed edge and no fill), so it reads apart from the active sheet by shape, not colour.
 */
export function ArchivedCollectionRow({ collection }: { collection: Collection }) {
  return (
    <article
      data-slot="collection-row"
      className={cn(ROW, 'items-center hover:bg-hover lg:gap-x-8')}
    >
      <CollectionSummary collection={collection} titleClassName="type-h3" />
      <SettingsLink collection={collection} />
    </article>
  );
}

function CollectionSummary({
  collection,
  titleClassName,
  className,
}: {
  collection: Collection;
  titleClassName: string;
  className?: string;
}) {
  const t = useTranslations('collections');
  const format = useFormatter();
  const archived = collection.status === 'ARCHIVED';
  const status = t(`status.${collection.status}`);
  const date = format.dateTime(new Date(collection.archivedAt ?? collection.createdAt), 'short');

  return (
    <div className={cn('grid min-w-0 content-start gap-2', className)}>
      {/* The clamp sits on the link, not the heading: a clamped heading would hide overflow. The
          focus ring is drawn by the row, around everything the link covers. */}
      <h3 className={cn('[overflow-wrap:anywhere]', titleClassName)}>
        <Link
          data-slot="collection-link"
          href={`/app/collections/${collection.id}`}
          title={collection.title}
          className="line-clamp-3 text-foreground no-underline decoration-1 underline-offset-4 outline-none group-hover:underline after:absolute after:inset-0 after:content-['']"
        >
          {collection.title}
        </Link>
      </h3>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant={archived ? 'neutral' : 'success'} title={status}>
          {status}
        </Badge>
        <span className="text-sm text-muted-foreground tabular-nums">
          {archived ? t('archivedOn', { date }) : t('createdOn', { date })}
        </span>
      </p>
      {collection.description !== null && !archived ? (
        <p className="line-clamp-2 text-sm leading-[1.45] whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">
          {collection.description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A 44px outline icon button to the collection's settings, named after the collection (and shown
 * as a tooltip). The only other action of a row, so it stays visible instead of hiding in a menu.
 */
function SettingsLink({ collection, className }: { collection: Collection; className?: string }) {
  const t = useTranslations('collections');
  const label = t('cardSettings', { title: collection.title });
  return (
    <Button
      asChild
      variant="outline"
      size="icon"
      className={cn(
        'relative z-1 self-start text-muted-foreground hover:text-foreground lg:self-center',
        className,
      )}
    >
      <Link href={`/app/collections/${collection.id}/settings`} aria-label={label} title={label}>
        <Settings aria-hidden="true" className="size-5" />
      </Link>
    </Button>
  );
}
