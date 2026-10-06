'use client';

import type { Collection } from '@stepler/contracts';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { CollectionBreadcrumbs } from '@/components/breadcrumbs';
import { CollectionMark } from '../../collection-mark';
import { AccessBadge, CollectionStatusBadge } from '../../collection-row';
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
  const date = format.dateTime(new Date(collection.archivedAt ?? collection.createdAt), 'short');
  const dated = archived ? tList('archivedOn', { date }) : tList('createdOn', { date });
  const badge = (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted-foreground">
      <CollectionStatusBadge collection={collection} short />
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
        <CollectionMark
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
            <ClampedDescription text={collection.description} />
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

/**
 * The mini-nav's description, at most 4 lines (owner 2026-10-06: a long one pushed the tabs
 * down), with «Показати більше / менше» when it is cut. The button exists only then.
 */
function ClampedDescription({ text }: { text: string }) {
  const t = useTranslations('collection');
  const id = useId();
  const box = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null || expanded) return;
    const measure = () => setCut(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);
  return (
    <div className="grid justify-items-start gap-0.5">
      <p
        id={id}
        ref={box}
        className={cn(
          'text-[0.875rem] leading-[1.45] whitespace-pre-line text-foreground-soft [overflow-wrap:anywhere]',
          { 'line-clamp-4': !expanded },
        )}
      >
        {text}
      </p>
      {cut || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            '-mx-1 inline-flex min-h-8 items-center rounded-control px-1 text-[0.875rem] font-medium text-link hover:text-link-hover pointer-coarse:min-h-11',
            focusRing,
          )}
        >
          {expanded ? t('descriptionLess') : t('descriptionMore')}
        </button>
      ) : null}
    </div>
  );
}
