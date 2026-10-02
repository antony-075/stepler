'use client';

import type { Collection } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { formatFrameNumber } from '@stepler/ui/components/empty-state';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { Settings } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

/**
 * One collection on the dashboard (DESIGN-SYSTEM.md §5.10 `CollectionStrip`, §6.5): a row of the
 * active sheet. Title, status and date on the left; the film strip in the middle; Open and the
 * settings link on the right (from `lg`; stacked on phones). Before content exists (slice 7) the
 * strip is the honest empty frame «#001» with one line, and no QR or link actions: guest links
 * arrive in slice 2, and nothing here pretends otherwise (plan D6).
 *
 * The title is a link and wraps anywhere, up to 3 lines, with the full text in `title`.
 */
export function CollectionStrip({ collection }: { collection: Collection }) {
  const t = useTranslations('collections');
  return (
    <article
      data-slot="collection-strip"
      className="grid gap-4 p-4 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_auto] lg:items-center lg:gap-8"
    >
      <CollectionSummary collection={collection} titleClassName="type-h2" />
      <div className="flex min-w-0 items-center gap-4">
        <div aria-hidden="true" className="grid w-12 shrink-0 gap-1 sm:w-16 lg:w-20">
          <div className="aspect-square rounded-frame border border-dashed border-input" />
          <span className="type-data text-muted-foreground" translate="no">
            {formatFrameNumber(1)}
          </span>
        </div>
        <p className="max-w-[46ch] text-sm leading-[1.45] text-muted-foreground sm:text-[0.9375rem]">
          {t('emptyStrip')}
        </p>
      </div>
      <CollectionActions collection={collection} />
    </article>
  );
}

/**
 * An archived collection: a compact row without a film strip, drawn on the page itself (the
 * archive list has a dashed edge and no fill), so it reads apart from the active sheet by shape,
 * not by another colour.
 */
export function ArchivedCollectionRow({ collection }: { collection: Collection }) {
  return (
    <article
      data-slot="collection-row"
      className="grid gap-3 p-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8"
    >
      <CollectionSummary collection={collection} titleClassName="type-h3" />
      <CollectionActions collection={collection} />
    </article>
  );
}

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
    <div className="grid min-w-0 content-start gap-1.5">
      {/* The clamp sits on the link, not the heading: a clamped heading hides overflow and
          would clip the link's focus outline. */}
      <h3 className={cn('[overflow-wrap:anywhere]', titleClassName)}>
        <Link
          href={`/app/collections/${collection.id}`}
          title={collection.title}
          className={cn(
            'line-clamp-3 rounded-frame text-foreground no-underline decoration-1 underline-offset-4 hover:underline',
            focusRing,
          )}
        >
          {collection.title}
        </Link>
      </h3>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
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

/** Open (the main path on phones) and a 44px settings link; both name the collection. */
function CollectionActions({ collection }: { collection: Collection }) {
  const t = useTranslations('collections');
  const settingsLabel = t('cardSettings', { title: collection.title });
  return (
    <div className="flex items-center justify-between gap-2 lg:justify-end">
      <Button asChild variant="outline">
        <Link
          href={`/app/collections/${collection.id}`}
          aria-label={t('openLabel', { title: collection.title })}
          className="no-underline"
        >
          {t('open')}
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
        <Link
          href={`/app/collections/${collection.id}/settings`}
          aria-label={settingsLabel}
          title={settingsLabel}
        >
          <Settings aria-hidden="true" className="size-5" />
        </Link>
      </Button>
    </div>
  );
}
