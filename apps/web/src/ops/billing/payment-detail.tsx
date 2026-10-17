'use client';

// Design pass (billing M4, Task 21; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). One payment, read top to bottom in the order the operator decides:
// - the heading is the amount («Платіж на 1 200,00 ₴») with the status badge; a review or
//   mismatch flag is a warning alert right under it, in words, saying what to check;
// - the facts as a definition list (two columns from `md`, one on phones), times in Kyiv;
// - «Повернення»: what can still be refunded, the one filled destructive button «Повернути
//   кошти» (the refund dialog), then the refunds made; a note says a refund does not end what was
//   bought, with «Завершити пакет» beside it for a pack (reason dialog, destructive);
// - «Повідомлення від LiqPay»: each verified callback's whitelisted fields, monospace values,
//   never card data (the API never has it).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OperatorPaymentDetail, OperatorPaymentEvent, RefundDto } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { EmptyState } from '@stepler/ui/components/empty-state';
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@stepler/ui/components/panel';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useToast } from '@stepler/ui/components/toast';
import { ChevronLeft } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import type { OpsAction } from '../actions';
import { billingKeys, endPack, fetchPayment } from '../api/billing';
import { isOpsApiError } from '../api/client';
import { ReasonDialog } from '../reason-dialog';
import { KYIV, PAYMENT_BADGE } from './billing-labels';
import { formatMinor } from './plan-format';
import { RefundDialog, type RefundTarget } from './refund-dialog';

const REFUND_BADGE = { PENDING: 'neutral', SUCCEEDED: 'warning', FAILED: 'danger' } as const;

export function PaymentDetail({ id }: { id: string }) {
  const t = useTranslations('ops');
  const query = useQuery({
    queryKey: billingKeys.payment(id),
    queryFn: ({ signal }) => fetchPayment(id, signal),
    retry: false,
  });
  const back = (
    <Link
      href="/ops/billing/payments"
      className="inline-flex min-h-11 items-center gap-1 text-[0.875rem] text-link hover:underline md:min-h-9"
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      {t('payment.back')}
    </Link>
  );
  if (query.isPending) {
    return (
      <div aria-hidden="true" className="grid max-w-4xl gap-4">
        {back}
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 rounded-sheet" />
        <Skeleton className="h-32 rounded-sheet" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="grid max-w-4xl gap-4">
        {back}
        {isOpsApiError(query.error, 'NOT_FOUND') ? (
          <div className="rounded-sheet border bg-card">
            <EmptyState title={t('payment.notFound')} />
          </div>
        ) : (
          <Alert
            variant="error"
            title={t('payment.failed')}
            action={
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t('retry')}
              </Button>
            }
          />
        )}
      </div>
    );
  }
  return <Detail back={back} detail={query.data} />;
}

function Detail({ back, detail }: { back: ReactNode; detail: OperatorPaymentDetail }) {
  const t = useTranslations('ops');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [refund, setRefund] = useState<RefundTarget | null>(null);
  const [action, setAction] = useState<OpsAction | null>(null);
  const { payment } = detail;
  const money = (minor: number) => formatMinor(format.number, minor, payment.currency);
  const date = (iso: string | null) =>
    iso === null
      ? t('payment.notPaid')
      : format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short', timeZone: KYIV });
  const isPack =
    (payment.kind === 'PACK' || payment.kind === 'PACK_EXTENSION') && payment.collectionId !== null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: billingKeys.all });

  const confirmEnd = async (reason: string) => {
    try {
      await endPack(payment.collectionId ?? '', reason);
    } catch (error) {
      throw new Error(isOpsApiError(error, 'NOT_FOUND') ? t('actions.gone') : t('actions.failed'), {
        cause: error,
      });
    }
    await refresh();
    toast({ variant: 'success', title: t('actions.packEnd.done') });
  };

  return (
    <article aria-labelledby="ops-payment-title" className="grid max-w-4xl gap-5">
      {back}
      <header className="grid gap-2">
        <h1 id="ops-payment-title" className="type-h1 tabular-nums">
          {t('payment.title', { amount: money(payment.amountMinor) })}
        </h1>
        <p className="flex flex-wrap items-center gap-2">
          <Badge variant={PAYMENT_BADGE[payment.status]}>
            {t(`payments.statuses.${payment.status}`)}
          </Badge>
          <span className="text-foreground-soft">
            {t('payments.what', {
              kind: t(`payments.kinds.${payment.kind}`),
              title: payment.offerTitle,
            })}
          </span>
        </p>
      </header>
      {payment.needsReview ? <Alert variant="warning">{t('payment.needsReview')}</Alert> : null}
      {payment.mismatch ? <Alert variant="warning">{t('payment.mismatch')}</Alert> : null}

      <Panel>
        <PanelContent>
          <dl className="grid gap-x-8 gap-y-3 text-[0.9375rem] md:grid-cols-2">
            <Fact label={t('payment.account')}>
              <Link
                href={`/ops/billing/grants?${new URLSearchParams({ email: payment.email }).toString()}`}
                className="text-link [overflow-wrap:anywhere] hover:underline"
              >
                {payment.email}
              </Link>
            </Fact>
            <Fact label={t('payment.what')}>{payment.offerTitle}</Fact>
            <Fact label={t('payment.createdAt')}>{date(payment.createdAt)}</Fact>
            <Fact label={t('payment.paidAt')}>{date(payment.paidAt)}</Fact>
            <Fact label={t('payment.orderId')}>
              <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">
                {payment.id}
              </span>
            </Fact>
            {payment.collectionId === null ? null : (
              <Fact label={t('payment.collection')}>
                <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">
                  {payment.collectionId}
                </span>
              </Fact>
            )}
            {payment.errCode === null ? null : (
              <Fact label={t('payment.errCode')}>
                <span className="font-mono text-[0.8125rem]">{payment.errCode}</span>
              </Fact>
            )}
          </dl>
          {payment.subscriptionId === null ? null : (
            <p className="mt-4">
              <Link
                href={`/ops/billing/subscriptions?${new URLSearchParams({ email: payment.email }).toString()}`}
                className="inline-flex min-h-11 items-center text-link hover:underline md:min-h-9"
              >
                {t('payment.subscriptionLink')}
              </Link>
            </p>
          )}
        </PanelContent>
      </Panel>

      <Panel aria-labelledby="ops-payment-refunds">
        <PanelHeader>
          <PanelTitle id="ops-payment-refunds">{t('payment.refundsTitle')}</PanelTitle>
        </PanelHeader>
        <PanelContent className="grid gap-4">
          <p className="text-foreground-soft">
            {detail.refundableMinor > 0
              ? t('payment.refundable', { amount: money(detail.refundableMinor) })
              : t('payment.nothingRefundable')}
          </p>
          <div className="flex flex-wrap gap-2">
            {detail.refundableMinor > 0 ? (
              <Button
                variant="destructive"
                onClick={() =>
                  setRefund({
                    paymentId: payment.id,
                    refundableMinor: detail.refundableMinor,
                    currency: payment.currency,
                  })
                }
              >
                {t('payment.refundButton')}
              </Button>
            ) : null}
            {isPack ? (
              <Button variant="outline" onClick={() => setAction('packEnd')}>
                {t('payment.endPackButton')}
              </Button>
            ) : null}
          </div>
          <p className="text-[0.875rem] text-muted-foreground">{t('payment.afterRefund')}</p>
          {detail.refunds.length === 0 ? (
            <p className="text-muted-foreground">{t('payment.noRefunds')}</p>
          ) : (
            <ul className="divide-y rounded-control border">
              {detail.refunds.map((row) => (
                <RefundRow key={row.id} row={row} money={money} date={date} />
              ))}
            </ul>
          )}
        </PanelContent>
      </Panel>

      <Panel aria-labelledby="ops-payment-events">
        <PanelHeader>
          <PanelTitle id="ops-payment-events">{t('payment.eventsTitle')}</PanelTitle>
        </PanelHeader>
        <PanelContent>
          {detail.events.length === 0 ? (
            <p className="text-muted-foreground">{t('payment.noEvents')}</p>
          ) : (
            <ul className="grid gap-3">
              {detail.events.map((event) => (
                <EventRow key={event.id} event={event} date={date} />
              ))}
            </ul>
          )}
        </PanelContent>
      </Panel>

      <RefundDialog
        target={refund}
        onOpenChange={(open) => {
          if (!open) setRefund(null);
        }}
        onDone={(outcome) => {
          void refresh();
          toast({
            variant: 'success',
            title: outcome === 'SUCCEEDED' ? t('refund.done') : t('refund.sent'),
          });
        }}
      />
      <ReasonDialog
        action={action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        onConfirm={confirmEnd}
      />
    </article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function RefundRow({
  row,
  money,
  date,
}: {
  row: RefundDto;
  money: (minor: number) => string;
  date: (iso: string | null) => string;
}) {
  const t = useTranslations('ops.payment');
  return (
    <li className="grid gap-1 p-3 text-[0.9375rem]">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium tabular-nums">{money(row.amountMinor)}</span>
        <Badge variant={REFUND_BADGE[row.status]}>{t(`refundStatuses.${row.status}`)}</Badge>
      </span>
      <span className="text-foreground-soft [overflow-wrap:anywhere]">{row.reason}</span>
      <span className="text-[0.8125rem] text-muted-foreground tabular-nums">
        {date(row.createdAt)}
        {row.providerStatus === null ? null : (
          <>
            {' '}
            <span className="font-mono">{row.providerStatus}</span>
          </>
        )}
      </span>
    </li>
  );
}

function EventRow({
  event,
  date,
}: {
  event: OperatorPaymentEvent;
  date: (iso: string | null) => string;
}) {
  const t = useTranslations('ops.payment');
  const outcome =
    event.outcome !== null && event.outcome in OUTCOMES
      ? t(`eventOutcomes.${event.outcome as keyof typeof OUTCOMES}`)
      : t('eventPending');
  return (
    <li className="grid gap-2 rounded-control border p-3">
      <span className="flex flex-wrap justify-between gap-2 text-[0.875rem]">
        <span className="tabular-nums">{date(event.receivedAt)}</span>
        <span className="text-foreground-soft">{outcome}</span>
      </span>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-[0.8125rem]">
        {Object.entries(event.payload).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="[overflow-wrap:anywhere]">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

const OUTCOMES = { applied: 1, noop: 1, mismatch: 1, review: 1, unknown_order: 1 } as const;
