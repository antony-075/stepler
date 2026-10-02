'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { TintTile } from '@stepler/ui/components/tint-tile';
import { cn } from '@stepler/ui/lib/utils';
import { Link2, Settings } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { collectionInitials } from './collection-initials';
import { collectionTint } from './collection-tint';

// The whole row is the link to the collection: the title link is stretched over the row with
// `::after`, so a tap anywhere opens it, while the accessible name stays the title alone. The row
// shows hover and the violet focus ring (inset: the sheet clips overflow); the settings button
// sits above the stretched link (`z-1`), so it keeps its own click and focus.
const ROW = cn(
  'group relative grid grid-cols-[auto_minmax(0,1fr)_auto] content-start items-start gap-x-4 gap-y-2 p-4 sm:gap-x-5 sm:px-6 sm:py-5',
  'transition-colors duration-(--duration-fast) motion-reduce:transition-none',
  'has-[[data-slot=collection-link]:focus-visible]:outline-2 has-[[data-slot=collection-link]:focus-visible]:-outline-offset-2 has-[[data-slot=collection-link]:focus-visible]:outline-ring has-[[data-slot=collection-link]:focus-visible]:outline-solid',
);

/**
 * One active collection on the dashboard (DESIGN-SYSTEM.md §5.10 `CollectionStrip`, §6.5; owner
 * review 2026-10-02: the old row was dense and its statuses unclear). Top to bottom: the title
 * (level with the settings button), the description (two lines at most), then one line of
 * status: two labelled tags that read on their own, «Колекція активна» (a filled tag) and the
 * main guest link's «Посилання активне / призупинене» (an outlined tag with a link icon, so the
 * two never look like one), and last, quieter, what is in it and when it was made, apart from
 * the statuses. Before content exists (slice 7) the cover is an identity tile: the collection's
 * initials in its own tint; once it has content the newest photo replaces the tile.
 *
 * Cover left, settings right at every width (cover 56px on phones, 64px from `sm`). On phones
 * everything under the title runs under the settings button too, so nothing is squeezed into
 * the narrow column next to it.
 */
export function CollectionStrip({ collection }: { collection: Collection }) {
  return (
    <article data-slot="collection-strip" className={cn(ROW, 'hover:bg-hover-card')}>
      <CollectionCover collection={collection} size="md" />
      <CollectionSummary collection={collection} titleClassName="type-h2" />
      <SettingsLink collection={collection} />
    </article>
  );
}

/**
 * An archived collection: a compact row with a smaller cover, on the page itself (the archive
 * list has a dashed edge and no fill), so it reads apart from the active sheet by shape, not
 * colour.
 */
export function ArchivedCollectionRow({ collection }: { collection: Collection }) {
  return (
    <article data-slot="collection-row" className={cn(ROW, 'hover:bg-hover')}>
      <CollectionCover collection={collection} size="sm" />
      <CollectionSummary collection={collection} titleClassName="type-h3" />
      <SettingsLink collection={collection} />
    </article>
  );
}

/** The identity tile: decorative (the title names the collection), so hidden from AT. */
function CollectionCover({ collection, size }: { collection: Collection; size: 'sm' | 'md' }) {
  return (
    <TintTile tint={collectionTint(collection.id)} size={size} className="col-[1] row-[1/span_2]">
      <span translate="no">{collectionInitials(collection.title)}</span>
    </TintTile>
  );
}

/** The title (row 1, level with settings) and everything else under it (row 2). */
function CollectionSummary({
  collection,
  titleClassName,
}: {
  collection: Collection;
  titleClassName: string;
}) {
  const t = useTranslations('collections');
  const format = useFormatter();
  const archived = collection.status === 'ARCHIVED';
  const status = t(`statusChip.${collection.status}`);
  const date = format.dateTime(new Date(collection.archivedAt ?? collection.createdAt), 'short');

  return (
    <>
      {/* The clamp sits on the link, not the heading: a clamped heading would hide overflow. The
          focus ring is drawn by the row, around everything the link covers. */}
      <h3
        className={cn(
          'col-[2] row-[1] min-w-0 self-center [overflow-wrap:anywhere]',
          titleClassName,
        )}
      >
        <Link
          data-slot="collection-link"
          href={`/app/collections/${collection.id}`}
          title={collection.title}
          className="line-clamp-3 text-foreground no-underline decoration-1 underline-offset-4 outline-none group-hover:underline after:absolute after:inset-0 after:content-['']"
        >
          {collection.title}
        </Link>
      </h3>
      <div className="col-[2/span_2] row-[2] grid min-w-0 gap-3 sm:col-[2]">
        {collection.description !== null && !archived ? (
          <p className="line-clamp-2 max-w-[72ch] text-[0.9375rem] leading-[1.45] whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">
            {collection.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p data-slot="collection-status" className="flex flex-wrap items-center gap-2">
            <Badge variant={archived ? 'neutral' : 'success'} title={status}>
              {status}
            </Badge>
            {archived || collection.defaultLinkStatus === null ? null : (
              <LinkStatus status={collection.defaultLinkStatus} />
            )}
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {/* Until content exists (slice 7) every active collection is empty; said once. */}
            {archived ? null : <span>{t('noContentYet')}</span>}
            <span className="tabular-nums">
              {archived ? t('archivedOn', { date }) : t('createdOn', { date })}
            </span>
          </p>
        </div>
      </div>
    </>
  );
}

/**
 * The main guest link's state (§6.5) as an outlined tag with a link icon: «Посилання активне»
 * (success) / «Посилання призупинене» (warning). The icon's colour is decoration; the words
 * carry the state. Absent for archived rows and for collections whose default link was never
 * ensured (pre-slice-2, G4).
 */
function LinkStatus({ status }: { status: 'ACTIVE' | 'INACTIVE' }) {
  const t = useTranslations('collections');
  const active = status === 'ACTIVE';
  return (
    <span
      data-slot="collection-link-status"
      data-status={status}
      className="inline-flex h-6 items-center gap-1.5 rounded-sheet border px-2 text-[0.8125rem] leading-[1.4] font-medium whitespace-nowrap text-foreground"
    >
      <Link2
        aria-hidden="true"
        className={cn('size-3.5 shrink-0', active ? 'text-success' : 'text-warning')}
      />
      {active ? t('linkActive') : t('linkPaused')}
    </span>
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
        'relative z-1 col-[3] row-[1] self-start text-muted-foreground hover:text-foreground sm:row-[1/span_2]',
        className,
      )}
    >
      <Link href={`/app/collections/${collection.id}/settings`} aria-label={label} title={label}>
        <Settings aria-hidden="true" className="size-5" />
      </Link>
    </Button>
  );
}
