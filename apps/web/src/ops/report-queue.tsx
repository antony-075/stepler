'use client';

// Design pass (slice 9, Task 10; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design): a work queue read top to bottom, newest first. Decisions:
// - the three statuses are the V1 segmented tabs (full width on phones, their own width from
//   `md`), driven by `?status=` so a tab is a link the operator can reload or share;
// - from `md` a dense table (rows 56px, 14px text, numbers and times in Geist Mono), each row one
//   link (the frame cell's link stretches over the row) so keyboard users tab once per report;
//   below `md` the same fields as stacked cards, never a horizontally scrolling table;
// - the frame's state is the only colour in a row (Видимий neutral, Прихований warning,
//   Видалений danger); the reason is plain text, so colour never carries the meaning alone;
// - paging is an explicit «Показати ще» button (no infinite scroll: the operator keeps their
//   place); loading is skeleton rows in the table's shape; empty and error states per tab.
import { useInfiniteQuery } from '@tanstack/react-query';
import type { OperatorReportRow, ReportStatus } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { EmptyState, formatFrameNumber } from '@stepler/ui/components/empty-state';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@stepler/ui/components/tabs';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchReports, opsKeys } from './api/operator';
import { ContentKindIcon } from './content-kind-icon';
import { paramOfStatus, REPORT_TABS, STATE_BADGE } from './report-labels';

export function ReportQueue({ status }: { status: ReportStatus }) {
  const t = useTranslations('ops');
  const router = useRouter();
  const query = useInfiniteQuery({
    queryKey: opsKeys.reports(status),
    queryFn: ({ pageParam, signal }) => fetchReports({ status, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="ops-queue-title" className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="ops-queue-title" className="type-h1">
          {t('queue.title')}
        </h1>
      </div>
      <Tabs
        value={status}
        onValueChange={(value) =>
          router.replace(`/ops/reports?status=${paramOfStatus(value as ReportStatus)}`)
        }
      >
        <TabsList variant="segmented" aria-label={t('queue.tabsLabel')}>
          {REPORT_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`statuses.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {query.isPending ? (
        <QueueSkeleton />
      ) : query.isError ? (
        <Alert
          variant="error"
          title={t('queue.error')}
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <div className="rounded-sheet border bg-card">
          <EmptyState title={t(`queue.empty.${status}`)} />
        </div>
      ) : (
        <>
          <QueueTable rows={rows} />
          <QueueCards rows={rows} />
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

function useRowText() {
  const t = useTranslations('ops');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return {
    received: (row: OperatorReportRow) => {
      const at = new Date(row.createdAt);
      return {
        relative: format.relativeTime(at, now),
        absolute: format.dateTime(at, { dateStyle: 'medium', timeStyle: 'short' }),
      };
    },
    collection: (row: OperatorReportRow) => row.collection?.title ?? t('queue.collectionGone'),
  };
}

/** «Фото #086»: the kind in the text face, the number in mono (numbers only, §0.2). */
function ContentLabel({ row }: { row: OperatorReportRow }) {
  const t = useTranslations('ops');
  if (row.content === null) return <span className="truncate">{t('queue.contentGone')}</span>;
  return (
    <span className="truncate">
      {t(`kinds.${row.content.kind}`)}{' '}
      <span className="font-mono text-[0.8125rem]">{formatFrameNumber(row.content.frameNo)}</span>
    </span>
  );
}

function StateBadge({ row }: { row: OperatorReportRow }) {
  const t = useTranslations('ops');
  if (row.content === null) return <Badge variant="danger">{t('states.DELETED')}</Badge>;
  return <Badge variant={STATE_BADGE[row.content.state]}>{t(`states.${row.content.state}`)}</Badge>;
}

function QueueTable({ rows }: { rows: OperatorReportRow[] }) {
  const t = useTranslations('ops');
  const text = useRowText();
  return (
    <div className="hidden overflow-hidden rounded-sheet border bg-card md:block">
      <table className="w-full table-fixed text-[0.875rem]">
        <caption className="sr-only">{t('queue.title')}</caption>
        <thead className="border-b text-left text-[0.8125rem] text-muted-foreground">
          <tr>
            <th scope="col" className="w-[9.5rem] px-4 py-2.5 font-medium">
              {t('queue.columns.received')}
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              {t('queue.columns.reason')}
            </th>
            <th scope="col" className="w-[10rem] px-4 py-2.5 font-medium">
              {t('queue.columns.content')}
            </th>
            <th scope="col" className="w-[10rem] px-4 py-2.5 font-medium">
              {t('queue.columns.state')}
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              {t('queue.columns.collection')}
            </th>
            <th scope="col" className="w-[7.5rem] px-4 py-2.5 text-right font-medium">
              {t('queue.columns.openReports')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const received = text.received(row);
            return (
              <tr
                key={row.id}
                className="relative h-14 transition-colors hover:bg-hover-ghost has-[a:focus-visible]:bg-hover-ghost"
              >
                <td className="px-4 text-[0.8125rem] text-muted-foreground tabular-nums">
                  <time dateTime={row.createdAt} title={received.absolute}>
                    {received.relative}
                  </time>
                </td>
                <td className="truncate px-4 font-medium">{t(`reasons.${row.reason}`)}</td>
                <td className="px-4">
                  <Link
                    href={`/ops/reports/${row.id}`}
                    className="flex items-center gap-2 outline-none after:absolute after:inset-0 focus-visible:underline"
                  >
                    {row.content === null ? null : <ContentKindIcon kind={row.content.kind} />}
                    <ContentLabel row={row} />
                  </Link>
                </td>
                <td className="px-4">
                  <StateBadge row={row} />
                </td>
                <td className="truncate px-4 text-foreground-soft">{text.collection(row)}</td>
                <td className="px-4 text-right font-mono">{row.openReportsOnItem}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QueueCards({ rows }: { rows: OperatorReportRow[] }) {
  const t = useTranslations('ops');
  const text = useRowText();
  return (
    <ul className="grid gap-2 md:hidden">
      {rows.map((row) => {
        const received = text.received(row);
        return (
          <li key={row.id}>
            <Link
              href={`/ops/reports/${row.id}`}
              className="grid min-h-11 gap-2 rounded-sheet border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium [overflow-wrap:anywhere]">
                  {t(`reasons.${row.reason}`)}
                </span>
                <StateBadge row={row} />
              </span>
              <span className="flex items-center gap-2 text-[0.875rem]">
                {row.content === null ? null : <ContentKindIcon kind={row.content.kind} />}
                <ContentLabel row={row} />
                <span className="min-w-0 truncate text-foreground-soft">
                  {text.collection(row)}
                </span>
              </span>
              <span className="flex justify-between gap-3 text-[0.8125rem] text-muted-foreground">
                <time dateTime={row.createdAt} title={received.absolute} className="tabular-nums">
                  {received.relative}
                </time>
                <span>{t('queue.openReportsCount', { count: row.openReportsOnItem })}</span>
              </span>
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
