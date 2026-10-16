'use client';

// Design pass (billing page v2; web-design-guidelines, responsive-design). The account's
// payments, newest first, styled like the dashboard's table (DESIGN-SYSTEM.md §0.8, §0.9b): a
// quiet 36px header row on `--subtle`, rows with a top border, every column left-aligned, numbers
// in mono. Columns: date and time (Kyiv, tabular figures), what was bought with the collection's
// name under it when known, the amount (mono) and the state as a badge in words. From `md` a real
// table with headers; below it each payment is a stacked block (what and amount, then date and
// state), so nothing scrolls sideways at 320px. Empty, loading and error states. Since v3 it is
// the «Історія оплат» tab alone. Paged by the API, 50 at a time, «Показати ще» under the table
// (a button, as in the frame lists).
import type { PaymentStatus } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge, type BadgeVariant } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { cn } from '@stepler/ui/lib/utils';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ReceiptText } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { listPayments, PAYMENTS_KEY } from '@/api/billing';
import { monoDigits } from '@/format/mono-digits';
import { formatMoney } from './offers';

const KYIV = 'Europe/Kyiv';

export const PAYMENT_BADGE: Record<PaymentStatus, BadgeVariant> = {
  PENDING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  EXPIRED: 'neutral',
  REVERSED: 'warning',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'neutral',
};

const SURFACE = 'rounded-sheet border bg-card shadow-card';
const HEAD_CELL = 'h-9 px-4 text-left align-middle text-xs font-medium first:pl-4 last:pr-4';
const CELL = 'px-4 py-3.5 align-middle max-md:p-0';

export function PaymentHistory({ collectionTitles }: { collectionTitles: Map<string, string> }) {
  const t = useTranslations('billing.history');
  const tBilling = useTranslations('billing');
  const format = useFormatter();
  const payments = useInfiniteQuery({
    queryKey: PAYMENTS_KEY,
    queryFn: ({ pageParam }) => listPayments(pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = payments.data?.pages.flatMap((page) => page.items) ?? [];
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short', timeZone: KYIV });

  return (
    <section aria-labelledby="history-title" className="grid gap-3">
      {/* The tab «Історія оплат» names it on screen; the heading stays for the outline. */}
      <h2 id="history-title" className="sr-only">
        {t('title')}
      </h2>
      {payments.isPending ? (
        <div className={cn(SURFACE, 'grid gap-px overflow-hidden')}>
          <Skeleton className="h-9 w-full rounded-none" />
          <Skeleton className="h-14 w-full rounded-none" />
          <Skeleton className="h-14 w-full rounded-none" />
        </div>
      ) : payments.isError ? (
        <Alert
          variant="error"
          action={
            <Button variant="outline" onClick={() => void payments.refetch()}>
              {tBilling('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      ) : items.length === 0 ? (
        <div className={cn(SURFACE, 'flex items-center gap-3 p-4 text-muted-foreground sm:p-5')}>
          <ReceiptText aria-hidden="true" className="size-5 shrink-0" />
          <p>{t('empty')}</p>
        </div>
      ) : (
        <div className={cn(SURFACE, 'overflow-hidden')}>
          <table className="w-full border-collapse text-[0.875rem] max-md:block">
            <thead className="bg-subtle text-muted-foreground max-md:sr-only">
              <tr>
                <th scope="col" className={HEAD_CELL}>
                  {t('time')}
                </th>
                <th scope="col" className={HEAD_CELL}>
                  {t('what')}
                </th>
                <th scope="col" className={HEAD_CELL}>
                  {t('amount')}
                </th>
                <th scope="col" className={HEAD_CELL}>
                  {t('status')}
                </th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {items.map((payment) => {
                const collection =
                  payment.collectionId === null
                    ? undefined
                    : collectionTitles.get(payment.collectionId);
                return (
                  <tr
                    key={payment.id}
                    className="border-t max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-4 max-md:gap-y-1.5 max-md:px-4 max-md:py-3.5 max-md:first:border-t-0"
                  >
                    <td
                      className={cn(
                        CELL,
                        'whitespace-nowrap text-foreground-soft tabular-nums md:w-[13rem] max-md:col-start-1 max-md:row-start-2 max-md:text-muted-foreground',
                      )}
                    >
                      {when(payment.createdAt)}
                    </td>
                    <td className={cn(CELL, 'max-md:col-start-1 max-md:row-start-1')}>
                      <span className="block font-medium [overflow-wrap:anywhere]">
                        {payment.offerTitle}
                      </span>
                      {collection === undefined ? null : (
                        <span className="block text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">
                          {collection}
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        CELL,
                        'whitespace-nowrap md:w-[9rem] max-md:col-start-2 max-md:row-start-1',
                      )}
                    >
                      {monoDigits(
                        formatMoney(format.number, payment),
                        'font-mono font-medium tabular-nums',
                      )}
                    </td>
                    <td
                      className={cn(
                        CELL,
                        'md:w-[11rem] max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end',
                      )}
                    >
                      <Badge variant={PAYMENT_BADGE[payment.status]}>
                        {t(`statuses.${payment.status}`)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {payments.hasNextPage ? (
        <Button
          variant="outline"
          className="justify-self-center"
          aria-disabled={payments.isFetchingNextPage || undefined}
          onClick={() => {
            if (!payments.isFetchingNextPage) void payments.fetchNextPage();
          }}
        >
          {t('loadMore')}
        </Button>
      ) : null}
      {payments.isFetchNextPageError ? <Alert variant="error">{t('loadMoreFailed')}</Alert> : null}
    </section>
  );
}
