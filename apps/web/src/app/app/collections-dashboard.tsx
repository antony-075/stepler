'use client';

// Design (direction C, DESIGN-SYSTEM.md §6.5, artboard C-dashboard):
// - The h1 «Колекції», the live "{used} of {limit} active collections" sentence under it and one
//   ink primary. No stat cards: the limit is a sentence, not a KPI.
// - Active collections are rows of one white sheet (`CollectionStrip`): title, status and date,
//   then the film strip. Before content exists the strip is the empty dashed frame «#001» and one
//   line; no counts, no QR or link buttons that do not work yet (plan D6, slice 2).
// - The archive follows as its own titled list of compact rows without strips, on the page
//   itself behind a dashed edge: set apart by shape, not by a second colour.
// - Empty is the empty frame of a contact sheet waiting for its first collection; the limit is
//   explained in the dialog (inline warning), never as a disabled button with no reason.
// - Phones first: each row stacks (summary, strip, actions); from `lg` it is one line.

import type { CollectionStatus } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { PageHeader } from '@stepler/ui/components/page-header';
import { Panel } from '@stepler/ui/components/panel';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { cn } from '@stepler/ui/lib/utils';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { collectionsListKey, fetchUsage, listCollections, USAGE_KEY } from '@/api/collections';
import { ArchivedCollectionRow, CollectionStrip } from './collection-strip';
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
            <span className="tabular-nums">
              {t('usage', { used: slots.used, limit: slots.limit })}
            </span>
          )
        }
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus aria-hidden="true" />
            {t('new')}
          </Button>
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
              className="grid gap-4 p-4 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_auto] lg:items-center lg:gap-8"
            >
              <div className="grid gap-2">
                <Skeleton className="h-7 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="aspect-square w-12 sm:w-16 lg:w-20" />
              <Skeleton className="h-11 w-28" />
            </div>
          ))}
        </Panel>
      ) : empty ? (
        <Panel variant="sheet">
          <EmptyState
            frameNumber={1}
            title={t('emptyTitle')}
            description={t('emptyText')}
            action={<Button onClick={openCreate}>{t('createFirst')}</Button>}
            className="py-12 sm:py-16"
          />
        </Panel>
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
