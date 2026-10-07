'use client';

// Design pass (slice 9b, Task 7; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design): the admins' appeals, the report queue's twin so the operator reads both
// the same way. Decisions:
// - three statuses as the V1 segmented tabs (Нові / Задоволені / Відхилені), driven by `?status=`;
// - from `md` a dense table: received, what it is about («Фото #086» or «Колекція»), the measure
//   as it stands now (a badge in words: Приховано / У карантині / Заблоковано / Знято), the
//   collection; each row one link. Below `md` the same fields as stacked cards;
// - «Показати ще» for paging; skeleton rows while loading; an empty and an error state per tab.
import { useInfiniteQuery } from '@tanstack/react-query';
import type { AppealStatus, OperatorAppealRow } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { EmptyState, formatFrameNumber } from '@stepler/ui/components/empty-state';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@stepler/ui/components/tabs';
import { FolderOpen } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { APPEAL_TABS, MEASURE_BADGE, paramOfAppealStatus } from './appeal-labels';
import { fetchAppeals, opsKeys } from './api/operator';
import { ContentKindIcon } from './content-kind-icon';

export function AppealQueue({ status }: { status: AppealStatus }) {
  const t = useTranslations('ops');
  const router = useRouter();
  const query = useInfiniteQuery({
    queryKey: opsKeys.appeals(status),
    queryFn: ({ pageParam, signal }) => fetchAppeals({ status, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="ops-appeals-title" className="grid gap-5">
      <h1 id="ops-appeals-title" className="type-h1">
        {t('appeals.title')}
      </h1>
      <Tabs
        value={status}
        onValueChange={(value) =>
          router.replace(`/ops/appeals?status=${paramOfAppealStatus(value as AppealStatus)}`)
        }
      >
        <TabsList variant="segmented" aria-label={t('appeals.tabsLabel')}>
          {APPEAL_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`appeals.statuses.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {query.isPending ? (
        <QueueSkeleton />
      ) : query.isError ? (
        <Alert
          variant="error"
          title={t('appeals.error')}
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <div className="rounded-sheet border bg-card">
          <EmptyState title={t(`appeals.empty.${status}`)} />
        </div>
      ) : (
        <>
          <AppealTable rows={rows} />
          <AppealCards rows={rows} />
          {query.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                aria-disabled={query.isFetchingNextPage || undefined}
                onClick={() => {
                  if (!query.isFetchingNextPage) void query.fetchNextPage();
                }}
              >
                {query.isFetchingNextPage ? t('queue.loading') : t('queue.more')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function useReceived() {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return (row: OperatorAppealRow) => {
    const at = new Date(row.createdAt);
    return {
      relative: format.relativeTime(at, now),
      absolute: format.dateTime(at, { dateStyle: 'medium', timeStyle: 'short' }),
    };
  };
}

/** «Фото #086», «Колекція», or the frame is gone. */
function TargetLabel({ row }: { row: OperatorAppealRow }) {
  const t = useTranslations('ops');
  if (row.targetType === 'COLLECTION') {
    return (
      <span className="flex items-center gap-2 truncate">
        <FolderOpen aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        {t('appeals.collectionTarget')}
      </span>
    );
  }
  if (row.content === null) return <span className="truncate">{t('queue.contentGone')}</span>;
  return (
    <span className="flex items-center gap-2 truncate">
      <ContentKindIcon kind={row.content.kind} />
      <span className="truncate">
        {t(`kinds.${row.content.kind}`)}{' '}
        <span className="font-mono text-[0.8125rem]">{formatFrameNumber(row.content.frameNo)}</span>
      </span>
    </span>
  );
}

function MeasureBadge({ row }: { row: OperatorAppealRow }) {
  const t = useTranslations('ops');
  return <Badge variant={MEASURE_BADGE[row.measure]}>{t(`appeals.measures.${row.measure}`)}</Badge>;
}

function AppealTable({ rows }: { rows: OperatorAppealRow[] }) {
  const t = useTranslations('ops');
  const received = useReceived();
  return (
    <div className="hidden overflow-hidden rounded-sheet border bg-card md:block">
      <table className="w-full table-fixed text-[0.875rem]">
        <caption className="sr-only">{t('appeals.title')}</caption>
        <thead className="border-b text-left text-[0.8125rem] text-muted-foreground">
          <tr>
            <th scope="col" className="w-[9.5rem] px-4 py-2.5 font-medium">
              {t('appeals.columns.received')}
            </th>
            <th scope="col" className="w-[12rem] px-4 py-2.5 font-medium">
              {t('appeals.columns.target')}
            </th>
            <th scope="col" className="w-[10rem] px-4 py-2.5 font-medium">
              {t('appeals.columns.measure')}
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              {t('appeals.columns.collection')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const at = received(row);
            return (
              <tr
                key={row.id}
                className="relative h-14 transition-colors hover:bg-hover-ghost has-[a:focus-visible]:bg-hover-ghost"
              >
                <td className="px-4 text-[0.8125rem] text-muted-foreground tabular-nums">
                  <time dateTime={row.createdAt} title={at.absolute}>
                    {at.relative}
                  </time>
                </td>
                <td className="px-4">
                  <Link
                    href={`/ops/appeals/${row.id}`}
                    className="flex items-center outline-none after:absolute after:inset-0 focus-visible:underline"
                  >
                    <TargetLabel row={row} />
                  </Link>
                </td>
                <td className="px-4">
                  <MeasureBadge row={row} />
                </td>
                <td className="truncate px-4 text-foreground-soft">
                  {row.collection?.title ?? t('queue.collectionGone')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AppealCards({ rows }: { rows: OperatorAppealRow[] }) {
  const t = useTranslations('ops');
  const received = useReceived();
  return (
    <ul className="grid gap-2 md:hidden">
      {rows.map((row) => {
        const at = received(row);
        return (
          <li key={row.id}>
            <Link
              href={`/ops/appeals/${row.id}`}
              className="grid min-h-11 gap-2 rounded-sheet border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 font-medium">
                  <TargetLabel row={row} />
                </span>
                <MeasureBadge row={row} />
              </span>
              <span className="min-w-0 truncate text-[0.875rem] text-foreground-soft">
                {row.collection?.title ?? t('queue.collectionGone')}
              </span>
              <time
                dateTime={row.createdAt}
                title={at.absolute}
                className="text-[0.8125rem] text-muted-foreground tabular-nums"
              >
                {at.relative}
              </time>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function QueueSkeleton() {
  const t = useTranslations('ops');
  return (
    <div role="status" aria-label={t('queue.loading')} className="grid gap-2">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-sheet" />
      ))}
    </div>
  );
}
