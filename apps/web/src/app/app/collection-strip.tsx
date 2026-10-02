'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { TintTile } from '@stepler/ui/components/tint-tile';
import { cn } from '@stepler/ui/lib/utils';
import { Settings } from 'lucide-react';
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
 * One active collection on the dashboard (DESIGN-SYSTEM.md §5.10 `CollectionStrip`, §6.5): its
 * cover, then title, status, date and description, and the settings button on the right. Before
 * content exists (slice 7) the cover is an identity tile: the collection's initials in its own
 * tint (chosen from its id, the same on its page); once it has content the newest photo
 * replaces the tile. Under the meta, the default guest link's state (slice 2); sharing itself
 * lives on the collection page, so a row stays one link plus settings.
 *
 * Cover left, settings right at every width (cover 56px on phones, 64px from `sm`). On phones
 * the meta and description run under the settings button too, so the date is not squeezed
 * into the narrow column next to it.
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

/** The title (row 1, level with settings) and the meta under it (row 2). */
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
  const status = t(`status.${collection.status}`);
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
      <div className="col-[2/span_2] row-[2] grid min-w-0 gap-2 sm:col-[2]">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge variant={archived ? 'neutral' : 'success'} title={status}>
            {status}
          </Badge>
          <span className="text-sm text-muted-foreground tabular-nums">
            {archived ? t('archivedOn', { date }) : t('createdOn', { date })}
          </span>
          {/* Until content exists (slice 7) every active collection is empty; said once, briefly. */}
          {archived ? null : (
            <span className="text-sm text-muted-foreground">{t('noContentYet')}</span>
          )}
        </p>
        {archived || collection.defaultLinkStatus === null ? null : (
          <LinkStatus status={collection.defaultLinkStatus} />
        )}
        {collection.description !== null && !archived ? (
          <p className="line-clamp-2 text-sm leading-[1.45] whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">
            {collection.description}
          </p>
        ) : null}
      </div>
    </>
  );
}

/**
 * The default guest link's state (§6.5): «● Посилання активне» / «◌ Посилання призупинене».
 * The dot (filled success, hollow warning) is decoration; the words carry the state. Absent for
 * archived rows and for collections whose default link was never ensured (pre-slice-2, G4).
 */
function LinkStatus({ status }: { status: 'ACTIVE' | 'INACTIVE' }) {
  const t = useTranslations('collections');
  const active = status === 'ACTIVE';
  return (
    <p
      data-slot="collection-link-status"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 shrink-0 rounded-full',
          active ? 'bg-success' : 'border-[1.5px] border-warning',
        )}
      />
      {active ? t('linkActive') : t('linkPaused')}
    </p>
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
