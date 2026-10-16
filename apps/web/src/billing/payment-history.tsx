'use client';

// Design pass (owner's pick 2026-10-16: «Історія платежів» from direction C, unified with the page,
// `surfaces.ts`; web-design-guidelines, responsive-design; DESIGN-SYSTEM.md §0.12). The account's
// payments, newest first, as one list card (CARD): each row has the date (Kyiv, tabular), what was
// bought with one detail line under it (the collection's name, else what kind of payment it was,
// and a refund when there was one), the state as a dot and a word, and the amount. A payment that
// failed or was reversed is the one tinted row, with what that means. From `md` the four parts
// sit in columns; below it the date and state go under what and amount, so nothing scrolls
// sideways at 320px. No filter chips: the API has no filter by kind, and filtering only the
// loaded pages would hide older payments without saying so. Paged by the API, 50 at a time,
// «Показати ще» under the list (a button, as in the frame lists).
import type { PaymentDto, PaymentStatus } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import type { BadgeVariant } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { cn } from '@stepler/ui/lib/utils';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ReceiptText } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { listPayments, PAYMENTS_KEY } from '@/api/billing';
import { formatMoney } from './offers';
import { CARD } from './surfaces';

const KYIV = 'Europe/Kyiv';

/** A payment state's tone (the ops console and the return page share it). */
export const PAYMENT_BADGE: Record<PaymentStatus, BadgeVariant> = {
  PENDING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  EXPIRED: 'neutral',
  REVERSED: 'warning',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'neutral',
};

const DOT: Record<PaymentStatus, string> = {
  PENDING: 'bg-primary',
  SUCCEEDED: 'bg-success-dot',
  FAILED: 'bg-destructive',
  EXPIRED: 'bg-input',
  REVERSED: 'bg-warning',
  REFUNDED: 'bg-input',
  PARTIALLY_REFUNDED: 'bg-input',
};

const WORD: Record<PaymentStatus, string> = {
  PENDING: 'text-link',
  SUCCEEDED: 'text-success',
  FAILED: 'text-destructive',
  EXPIRED: 'text-muted-foreground',
  REVERSED: 'text-warning',
  REFUNDED: 'text-muted-foreground',
  PARTIALLY_REFUNDED: 'text-muted-foreground',
};

/** The rows that need a second look: the money did not arrive or went back. */
const TROUBLE = new Set<PaymentStatus>(['FAILED', 'REVERSED']);

const troubleKey = (status: PaymentStatus) =>
  status === 'FAILED' ? ('trouble.FAILED' as const) : ('trouble.REVERSED' as const);

export function PaymentHistory({ collectionTitles }: { collectionTitles: Map<string, string> }) {
  const t = useTranslations('billing.history');
  const tBilling = useTranslations('billing');
  const payments = useInfiniteQuery({
    queryKey: PAYMENTS_KEY,
    queryFn: ({ pageParam }) => listPayments(pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = payments.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="history-title" className="grid gap-4">
      {/* The tab «Історія платежів» names it on screen; the heading stays for the outline. */}
      <h2 id="history-title" className="sr-only">
        {t('title')}
      </h2>
      {payments.isPending ? (
        <div className={cn(CARD, 'grid gap-px overflow-hidden')} aria-hidden="true">
          <Skeleton className="h-18 w-full rounded-none" />
          <Skeleton className="h-18 w-full rounded-none" />
          <Skeleton className="h-18 w-full rounded-none" />
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
        <div className={cn(CARD, 'flex items-center gap-3 p-6 text-muted-foreground')}>
          <ReceiptText aria-hidden="true" className="size-5 shrink-0" />
          <p>{t('empty')}</p>
        </div>
      ) : (
        <ul aria-labelledby="history-title" className={cn(CARD, 'overflow-hidden')}>
          {items.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              {...(payment.collectionId === null
                ? {}
                : { collection: collectionTitles.get(payment.collectionId) })}
            />
          ))}
        </ul>
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

function PaymentRow({
  payment,
  collection,
}: {
  payment: PaymentDto;
  collection?: string | undefined;
}) {
  const t = useTranslations('billing.history');
  const format = useFormatter();
  const trouble = TROUBLE.has(payment.status);
  const when = format.dateTime(new Date(payment.createdAt), {
    dateStyle: 'medium',
    timeZone: KYIV,
  });
  const details = [
    collection ?? t(`kinds.${payment.kind}`),
    payment.refundedMinor > 0 && payment.status === 'PARTIALLY_REFUNDED'
      ? t('refunded', {
          amount: formatMoney(format.number, {
            amountMinor: payment.refundedMinor,
            currency: payment.currency,
          }),
        })
      : null,
  ].filter((part): part is string => part !== null);
  return (
    <li
      data-slot="payment-row"
      data-status={payment.status}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t px-5 py-4 first:border-t-0 md:grid-cols-[8.5rem_minmax(0,1fr)_10rem_7.5rem] md:items-center md:gap-x-6 md:px-6',
        trouble && 'bg-warning-soft',
      )}
    >
      <span className="text-sm text-muted-foreground tabular-nums max-md:col-start-1 max-md:row-start-2 md:text-foreground-soft">
        {when}
      </span>
      <span className="grid min-w-0 gap-0.5 max-md:col-start-1 max-md:row-start-1">
        <span className="font-semibold [overflow-wrap:anywhere]">{payment.offerTitle}</span>
        <span
          className={cn(
            'text-sm [overflow-wrap:anywhere]',
            trouble && 'text-warning',
            !trouble && 'text-muted-foreground',
          )}
        >
          {trouble ? t(troubleKey(payment.status)) : details.join(' · ')}
        </span>
      </span>
      <span
        className={cn(
          'inline-flex items-center gap-2 text-sm font-semibold max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end',
          WORD[payment.status],
        )}
      >
        <span
          aria-hidden="true"
          className={cn('size-2 shrink-0 rounded-full', DOT[payment.status])}
        />
        {t(`statuses.${payment.status}`)}
      </span>
      <span className="text-right font-bold tabular-nums max-md:col-start-2 max-md:row-start-1">
        {formatMoney(format.number, payment)}
      </span>
    </li>
  );
}
