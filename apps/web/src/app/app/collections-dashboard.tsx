'use client';

// Design (direction C, DESIGN-SYSTEM.md §6.5, artboard C-dashboard):
// - The h1 «Колекції», the live "{used} of {limit} active collections" sentence under it with a
//   row of small squares, one per slot (filled = used), and one ink primary. No stat cards: the
//   limit is a sentence, not a KPI.
// - Active collections are rows of one white sheet (`CollectionStrip`), each row one link: the
//   collection's cover (its initials in its own tint until it has content), title, status and
//   date; no counts, no QR or link buttons that do not work yet (plan D6, slice 2).
// - The archive follows as its own titled list of compact rows without strips, on the page
//   itself behind a dashed edge: set apart by shape, not by a second colour.
// - Empty is an invitation, centred: a tinted tile with an icon (the same mark as an empty
//   collection), a headline, one line, the only "New collection" on the page (the header drops
//   its own) and three steps. The limit is explained in the dialog (inline warning), never as a
//   disabled button with no reason.
// - Phones first: a row is one line at every width (cover, summary, settings).

import type { CollectionStatus } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Panel } from '@stepler/ui/components/panel';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { TintTile } from '@stepler/ui/components/tint-tile';
import { FRAME_TINT_CLASSES, type FrameTint } from '@stepler/ui/lib/frame-tints';
import { cn } from '@stepler/ui/lib/utils';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Images, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { collectionsListKey, fetchUsage, listCollections, USAGE_KEY } from '@/api/collections';
import { ArchivedCollectionRow, CollectionStrip } from './collection-strip';
import { collectionTint } from './collection-tint';
import { CreateCollectionDialog } from './create-collection-dialog';

function useCollectionList(status: CollectionStatus) {
  return useInfiniteQuery({
    queryKey: collectionsListKey(status),
    queryFn: ({ pageParam }) => listCollections(status, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

type CollectionList = ReturnType<typeof useCollectionList>;

const itemsOf = (list: CollectionList) => list.data?.pages.flatMap((page) => page.items) ?? [];

export function CollectionsDashboard() {
  const t = useTranslations('collections');
  const [createOpen, setCreateOpen] = useState(false);
  const usage = useQuery({ queryKey: USAGE_KEY, queryFn: fetchUsage });
  const active = useCollectionList('ACTIVE');
  const archived = useCollectionList('ARCHIVED');

  const slots = usage.data?.activeCollections;
  const activeItems = itemsOf(active);
  const archivedItems = itemsOf(archived);
  const loading = active.isPending || archived.isPending;
  const failed = active.isError || archived.isError;
  const empty = !loading && !failed && activeItems.length === 0 && archivedItems.length === 0;

  const openCreate = () => setCreateOpen(true);

  return (
    <>
      <PageHeader
        size="compact"
        title={t('pageTitle')}
        description={
          slots === undefined ? (
            // Holds the line's height until usage arrives.
            <span aria-hidden="true" className="invisible">
              {t('usage', { used: 0, limit: 0 })}
            </span>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <UsageSquares
                used={slots.used}
                limit={slots.limit}
                tints={activeItems.map((collection) => collectionTint(collection.id))}
              />
              <span className="tabular-nums">
                {t('usage', { used: slots.used, limit: slots.limit })}
              </span>
            </span>
          )
        }
        actions={
          // Empty, the invitation below holds the only "New collection"; loading, neither is known yet.
          loading || empty ? null : (
            <Button onClick={openCreate} className="w-full sm:w-auto">
              <Plus aria-hidden="true" />
              {t('new')}
            </Button>
          )
        }
      />

      {failed ? (
        <Alert
          variant="error"
          action={
            <Button
              variant="outline"
              onClick={() => {
                if (active.isError) void active.refetch();
                if (archived.isError) void archived.refetch();
              }}
            >
              {t('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      ) : loading ? (
        <Panel variant="sheet" className="divide-y" aria-busy="true">
          <span role="status" className="sr-only">
            {t('loading')}
          </span>
          {[0, 1].map((key) => (
            <div
              key={key}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 p-4 sm:gap-x-5 sm:px-6 sm:py-5"
            >
              <Skeleton className="size-14 sm:size-16" />
              <div className="grid gap-2">
                <Skeleton className="h-7 w-3/4 max-w-80" />
                <Skeleton className="h-5 w-1/2 max-w-56" />
              </div>
              <Skeleton className="size-11" />
            </div>
          ))}
        </Panel>
      ) : empty ? (
        <EmptyDashboard onCreate={openCreate} />
      ) : (
        <div className="grid gap-10 lg:gap-12">
          <section aria-labelledby="collections-active" className="grid gap-3">
            {/* With nothing archived, "Active" would only repeat the page title. */}
            <h2
              id="collections-active"
              className={cn('type-h3', { 'sr-only': archivedItems.length === 0 })}
            >
              {t('active')}
            </h2>
            <Panel variant="sheet" className="divide-y">
              {activeItems.length === 0 ? (
                <p className="p-4 text-muted-foreground sm:p-6">{t('noActive')}</p>
              ) : (
                activeItems.map((collection) => (
                  <CollectionStrip key={collection.id} collection={collection} />
                ))
              )}
            </Panel>
            <ShowMore list={active} />
          </section>
          {archivedItems.length > 0 ? (
            <section aria-labelledby="collections-archive" className="grid gap-3">
              <div className="grid gap-1">
                <h2 id="collections-archive" className="type-h3">
                  {t('archive')}
                </h2>
                <p className="text-sm text-muted-foreground">{t('archiveHint')}</p>
              </div>
              <div className="divide-y rounded-sheet border border-dashed border-input">
                {archivedItems.map((collection) => (
                  <ArchivedCollectionRow key={collection.id} collection={collection} />
                ))}
              </div>
              <ShowMore list={archived} />
            </section>
          ) : null}
        </div>
      )}

      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        atLimit={slots !== undefined && slots.used >= slots.limit}
        limit={slots?.limit}
      />
    </>
  );
}

function ShowMore({ list }: { list: CollectionList }) {
  const t = useTranslations('collections');
  if (!list.hasNextPage) return null;
  return (
    <Button
      variant="outline"
      className="justify-self-center"
      aria-disabled={list.isFetchingNextPage || undefined}
      onClick={() => {
        if (!list.isFetchingNextPage) void list.fetchNextPage();
      }}
    >
      {t('showMore')}
    </Button>
  );
}

const USAGE_FREE = 'border-input';
const USAGE_UNKNOWN_TINT = 'border-foreground bg-foreground';
// At 12px the soft fill would vanish: a used slot is drawn in the tint's ink.
const USAGE_TINT: Record<FrameTint, string> = {
  sage: 'border-tint-sage-ink bg-tint-sage-ink',
  lavender: 'border-tint-lavender-ink bg-tint-lavender-ink',
  sand: 'border-tint-sand-ink bg-tint-sand-ink',
  sky: 'border-tint-sky-ink bg-tint-sky-ink',
};

/**
 * One small square per active-collection slot: a used slot in its collection's tint (ink until
 * the list arrives), a free one as an empty outline. The limit at a glance; the sentence next to
 * it says the same in words.
 */
function UsageSquares({
  used,
  limit,
  tints,
}: {
  used: number;
  limit: number;
  tints: readonly FrameTint[];
}) {
  return (
    <span aria-hidden="true" data-slot="usage-squares" className="inline-flex gap-1">
      {Array.from({ length: limit }, (_, index) => {
        const tint = tints[index];
        const tone =
          index >= used ? USAGE_FREE : tint === undefined ? USAGE_UNKNOWN_TINT : USAGE_TINT[tint];
        return <span key={index} className={cn('size-3 rounded-[1px] border', tone)} />;
      })}
    </span>
  );
}

const STEPS = ['create', 'share', 'collect'] as const;

// The step numbers pass 4.5:1 on their tint.
const STEP_TINTS: Record<(typeof STEPS)[number], FrameTint> = {
  create: 'lavender',
  share: 'sky',
  collect: 'sage',
};

/**
 * No collection yet: what a collection is, the one action, and how it works in three steps (a
 * real sequence, so numbered). Centred in its panel under the same mark an empty collection
 * shows (a tinted tile with an icon); nothing pretends to be content. Phones: one column with
 * the steps as rows; from `sm` the steps sit side by side.
 */
function EmptyDashboard({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations('collections');
  return (
    <Panel
      data-slot="collections-empty"
      className="grid justify-items-center gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:py-20"
    >
      <div className="grid max-w-[34rem] justify-items-center gap-6 text-center">
        <TintTile tint="lavender" size="lg">
          <Images aria-hidden="true" />
        </TintTile>
        <div className="grid gap-3">
          <h2 className="type-h2 [overflow-wrap:anywhere]">{t('emptyTitle')}</h2>
          <p className="text-pretty text-muted-foreground">{t('emptyText')}</p>
        </div>
        <Button onClick={onCreate} className="w-full sm:w-auto">
          <Plus aria-hidden="true" />
          {t('new')}
        </Button>
      </div>
      <ol
        aria-label={t('stepsLabel')}
        className="grid w-full max-w-3xl gap-4 border-t pt-8 sm:grid-cols-3 sm:gap-6"
      >
        {STEPS.map((step, index) => (
          <li
            key={step}
            className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2.5 sm:text-center"
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-sheet border text-sm font-semibold tabular-nums',
                FRAME_TINT_CLASSES[STEP_TINTS[step]],
              )}
            >
              {index + 1}
            </span>
            <span className="max-w-[24ch] text-balance">{t(`steps.${step}`)}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
