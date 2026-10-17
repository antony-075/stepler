'use client';

// Design pass (billing M2, Task 14; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). The return from LiqPay, usually on a phone a few seconds after paying:
// - one panel, one state at a time, the state's sentence as the panel's h1 so a screen reader
//   hears it on arrival and on every change (`aria-live="polite"`);
// - «Очікуємо підтвердження від банку» with a small spinner while the API asks LiqPay (every 3 s,
//   for the first 20 s; then «Оплату ще не підтверджено» (a declined card at LiqPay sends no
//   callback and leaves the order open), with «Спробувати ще раз» (the same order, freshly
//   signed) first, «Перевірити ще раз» second and the calm fact that no money is taken until
//   LiqPay confirms — never an endless spinner; polling goes on quietly for 2 minutes;
// - success is calm, not confetti: a green check, «Оплату отримано», what is now active and the
//   amount, and the one next step as the primary button («Відкрити колекцію»);
// - failure and expiry say that nothing was charged and offer «Спробувати ще раз» first;
// - buttons stack full width on phones, side by side from `sm`. Nothing comes from this page's
//   own URL except the payment id.
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { Spinner } from '@stepler/ui/components/spinner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, Clock } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { BILLING_KEY, fetchPayment, paymentKey } from '@/api/billing';
import { isApiError } from '@/api/client';
import { COLLECTIONS_KEY, USAGE_KEY } from '@/api/collections';
import { useCheckout } from '@/billing/checkout-redirect';
import { formatMoney, RETURN_POLL_LIMIT_MS, RETURN_POLL_MS, returnView } from '@/billing/offers';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function PaymentReturn() {
  const t = useTranslations('billing.return');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const raw = useSearchParams().get('payment') ?? '';
  const paymentId = UUID.test(raw) ? raw.toLowerCase() : null;
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const checkout = useCheckout();
  const router = useRouter();
  const [now, setNow] = useState(startedAt);
  const payment = useQuery({
    queryKey: paymentKey(paymentId ?? 'none'),
    queryFn: () => fetchPayment(paymentId ?? ''),
    enabled: paymentId !== null,
    retry: (count, error) => !isApiError(error, 'NOT_FOUND') && count < 2,
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING' && Date.now() - startedAt < RETURN_POLL_LIMIT_MS
        ? RETURN_POLL_MS
        : false,
  });
  const status = payment.data?.status;

  // The clock that turns «очікуємо» into «перевіримо пізніше».
  useEffect(() => {
    if (status !== 'PENDING') return;
    const timer = setInterval(() => setNow(Date.now()), RETURN_POLL_MS);
    return () => clearInterval(timer);
  }, [status]);

  // A settled payment changes access, limits and the history: refetch them once.
  useEffect(() => {
    if (status === undefined || status === 'PENDING') return;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY }),
      queryClient.invalidateQueries({ queryKey: USAGE_KEY }),
      queryClient.invalidateQueries({ queryKey: BILLING_KEY, exact: false }),
    ]);
  }, [status, queryClient]);

  const view = returnView({
    status,
    notFound: paymentId === null || isApiError(payment.error, 'NOT_FOUND'),
    failed: payment.isError,
    elapsedMs: now - startedAt,
  });
  const toBilling = (
    <Button asChild variant="outline">
      <Link href="/app/billing">{t('toBilling')}</Link>
    </Button>
  );
  const retryHref =
    payment.data?.collectionId == null
      ? '/app/billing'
      : `/app/billing?collection=${payment.data.collectionId}`;

  let body: ReactNode;
  switch (view) {
    case 'loading':
      body = <State icon={<Spinner label={t('loading')} />} title={t('loading')} />;
      break;
    case 'pending':
      body = (
        <State
          icon={<Spinner label={t('pendingTitle')} />}
          title={t('pendingTitle')}
          text={t('pendingText')}
        />
      );
      break;
    case 'unconfirmed':
      body = (
        <State
          icon={<Clock className="text-muted-foreground" />}
          title={t('unconfirmedTitle')}
          text={t('unconfirmedText')}
          note={t('moneyNote')}
          error={checkout.errorMessage}
          actions={
            <>
              <Button
                aria-disabled={checkout.pending}
                onClick={() => {
                  if (checkout.pending || paymentId === null) return;
                  // The order may be gone or past its time: then a new purchase.
                  checkout.start({ resume: paymentId }).catch((error: unknown) => {
                    if (isApiError(error, 'OFFER_UNAVAILABLE')) router.push(retryHref);
                  });
                }}
              >
                {checkout.pending ? <Spinner label={t('retry')} /> : null}
                {t('retry')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const restarted = Date.now();
                  setStartedAt(restarted);
                  setNow(restarted);
                  void payment.refetch();
                }}
              >
                {t('checkAgain')}
              </Button>
            </>
          }
        />
      );
      break;
    case 'succeeded':
      body =
        payment.data === undefined ? null : (
          <State
            icon={<CircleCheck className="text-success" />}
            title={t('succeededTitle')}
            text={t('succeededText', {
              title: payment.data.offerTitle,
              amount: formatMoney(format.number, payment.data),
            })}
            actions={
              <>
                {payment.data.collectionId === null ? null : (
                  <Button asChild>
                    <Link href={`/app/collections/${payment.data.collectionId}`}>
                      {t('openCollection')}
                    </Link>
                  </Button>
                )}
                {toBilling}
              </>
            }
          />
        );
      break;
    case 'failed':
    case 'expired':
      body = (
        <State
          icon={<CircleX className="text-destructive" />}
          title={view === 'failed' ? t('failedTitle') : t('expiredTitle')}
          text={view === 'failed' ? t('failedText') : t('expiredText')}
          actions={
            <>
              <Button asChild>
                <Link href={retryHref}>{t('retry')}</Link>
              </Button>
              {toBilling}
            </>
          }
        />
      );
      break;
    case 'notFound':
      body = (
        <Alert variant="warning" action={toBilling}>
          {t('notFound')}
        </Alert>
      );
      break;
    case 'error':
      body = (
        <Alert
          variant="error"
          action={
            <Button variant="outline" onClick={() => void payment.refetch()}>
              {t('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      );
      break;
  }

  return (
    <>
      <Panel>
        <PanelContent aria-live="polite" className="sm:p-8">
          {body}
        </PanelContent>
      </Panel>
      {checkout.handoff}
    </>
  );
}

function State({
  icon,
  title,
  text,
  note,
  error,
  actions,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  note?: string;
  error?: string | null;
  actions?: ReactNode;
}) {
  return (
    <div className="grid gap-4">
      <span aria-hidden="true" className="[&_svg]:size-8">
        {icon}
      </span>
      <div className="grid gap-2">
        <h1 className="type-h1 text-balance">{title}</h1>
        {text === undefined ? null : <p className="text-pretty text-foreground-soft">{text}</p>}
        {note === undefined ? null : (
          <p className="text-sm text-pretty text-muted-foreground">{note}</p>
        )}
      </div>
      {error === undefined || error === null ? null : <Alert variant="error">{error}</Alert>}
      {actions === undefined ? null : (
        <div className="grid gap-2 pt-2 sm:flex sm:flex-wrap">{actions}</div>
      )}
    </div>
  );
}
