'use client';

// Design pass (billing page v4, the owner's reference 2026-10-09; frontend-design,
// web-design-guidelines). What the owner can do with the plan, on «Ваш тариф»
// (DESIGN-SYSTEM.md §0.12): the one main action as a full-width filled button with its icon, the
// rest as a quiet row of ghost buttons under it, «Скасувати підписку» at its end:
// - no paid plan (trial, read-only, granted by Stepler): «Купити пакет» to «Тарифи»'s packs;
//   without a subscription also «Обрати тариф» in the quiet row;
// - a paid plan: «Змінити тариф» (to «Тарифи»), quiet «Купити пакет» and «Скасувати підписку»
//   (ConfirmDialog that says until when access stays);
// - in grace: «Оплатити зараз»; «Змінити тариф» waits (disabled with its reason), as it does while
//   a switch waits for payment (the tab's alert carries «Підтвердити оплату» then);
// - cancelled: «Відновити підписку» (the subscribe dialog with the consent again), quiet
//   «Купити пакет».
// `PendingChange` is a scheduled change as a quiet row with «Скасувати зміну».
import type { BillingSummary, SubscriptionDto } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, CreditCard, RefreshCw, RotateCcw, Tags } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { BILLING_KEY, cancelPendingChange, cancelSubscription } from '@/api/billing';
import { USAGE_KEY } from '@/api/collections';
import { billingHref, PACKS_SECTION_ID, SUBSCRIPTIONS_SECTION_ID } from './billing-tab';
import { formatMoney, type PlanInterval, type PricedPlan } from './offers';
import { usePlanPrice } from './plan-picker';
import { SubscribeDialog } from './subscribe-dialog';

const KYIV = 'Europe/Kyiv';
const MAIN = 'w-full';
const QUIET = 'flex flex-wrap items-center gap-x-1 gap-y-1 -mx-3 max-sm:-mt-1';

function useRefreshBilling() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: BILLING_KEY });
    void queryClient.invalidateQueries({ queryKey: USAGE_KEY });
  };
}

export function PlanActions({
  summary,
  resumePlan,
}: {
  summary: BillingSummary;
  resumePlan: PricedPlan | null;
}) {
  const t = useTranslations('billing');
  const subscription = summary.subscription;
  if (subscription === null || subscription.source !== 'LIQPAY') {
    return (
      <div className="grid gap-2">
        <Button asChild size="lg" className={MAIN}>
          <Link href={billingHref('plans', PACKS_SECTION_ID)}>
            <CreditCard aria-hidden="true" />
            {t('plan.buyPack')}
          </Link>
        </Button>
        {subscription === null ? (
          <div className={QUIET}>
            <Button asChild variant="ghost">
              <Link href={billingHref('plans', SUBSCRIPTIONS_SECTION_ID)}>
                <Tags aria-hidden="true" />
                {t('access.choosePlan')}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
  const buyPack = (
    <Button asChild variant="ghost">
      <Link href={billingHref('plans', PACKS_SECTION_ID)}>
        <CreditCard aria-hidden="true" />
        {t('plan.buyPack')}
      </Link>
    </Button>
  );
  return <PaidActions subscription={subscription} resumePlan={resumePlan} buyPack={buyPack} />;
}

function PaidActions({
  subscription,
  resumePlan,
  buyPack,
}: {
  subscription: SubscriptionDto;
  resumePlan: PricedPlan | null;
  buyPack: ReactNode;
}) {
  const t = useTranslations('billing.subscription');
  const format = useFormatter();
  const refresh = useRefreshBilling();
  const { toast } = useToast();
  const reasonId = useId();
  const [confirming, setConfirming] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [paying, setPaying] = useState(false);
  const end = subscription.currentPeriodEnd;
  const status = subscription.status;
  const awaiting = subscription.pendingChange?.awaitingPayment === true;
  const changeable = status === 'ACTIVE' && !awaiting;
  // In grace the missed renewal can be paid at once (a switch is confirmed by the tab's alert).
  const payable = status === 'PAST_DUE' && !awaiting && resumePlan !== null;
  const reasonKey = awaiting ? 'switchChange' : 'pastDueChange';
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: KYIV });

  const change = (
    <Button
      asChild={changeable}
      size={changeable ? 'lg' : 'default'}
      variant={changeable ? 'default' : 'ghost'}
      className={changeable ? MAIN : undefined}
      disabled={!changeable}
      aria-describedby={changeable ? undefined : reasonId}
    >
      {changeable ? (
        <Link href={billingHref('plans')}>
          <ArrowLeftRight aria-hidden="true" />
          {t('change')}
        </Link>
      ) : (
        <>
          <ArrowLeftRight aria-hidden="true" />
          {t('change')}
        </>
      )}
    </Button>
  );

  return (
    <>
      {status === 'CANCELED' ? (
        <div className="grid gap-2">
          {resumePlan === null ? null : (
            <Button size="lg" className={MAIN} onClick={() => setResuming(true)}>
              <RotateCcw aria-hidden="true" />
              {t('resume')}
            </Button>
          )}
          <div className={QUIET}>{buyPack}</div>
        </div>
      ) : (
        <div className="grid gap-2">
          {payable ? (
            <Button size="lg" className={MAIN} onClick={() => setPaying(true)}>
              <CreditCard aria-hidden="true" />
              {t('payNow')}
            </Button>
          ) : null}
          {changeable ? change : null}
          <div className={QUIET}>
            {changeable ? buyPack : change}
            <Button variant="ghost" className="sm:ml-auto" onClick={() => setConfirming(true)}>
              {t('cancel')}
            </Button>
          </div>
          {changeable ? null : (
            <p id={reasonId} className="text-sm text-muted-foreground">
              {t(reasonKey)}
            </p>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('cancelTitle')}
        description={t('cancelText', { date: end === null ? '' : date(end) })}
        confirmLabel={t('cancelConfirm')}
        cancelLabel={t('cancelKeep')}
        pendingLabel={t('cancelPending')}
        errorMessage={t('cancelFailed')}
        destructive
        onConfirm={async () => {
          await cancelSubscription();
          refresh();
          toast({ variant: 'success', title: t('canceledToast') });
        }}
      />
      {resumePlan === null || end === null || status !== 'CANCELED' ? null : (
        <SubscribeDialog
          plan={resumePlan}
          open={resuming}
          onOpenChange={setResuming}
          resumeFrom={end}
        />
      )}
      {resumePlan === null || !payable ? null : (
        <SubscribeDialog plan={resumePlan} open={paying} onOpenChange={setPaying} payNow />
      )}
    </>
  );
}

/**
 * A scheduled change, not yet in force: a downgrade «З 15 листопада: Pro, 500,00 ₴/міс» or a
 * switch «З 15 листопада — щорічно, 4 990,00 ₴» (B14), with «Скасувати зміну». A switch waiting
 * for its payment is the tab's alert instead, so nothing shows here.
 */
export function PendingChange({ subscription }: { subscription: SubscriptionDto }) {
  const t = useTranslations('billing.subscription');
  const format = useFormatter();
  const planPrice = usePlanPrice();
  const refresh = useRefreshBilling();
  const { toast } = useToast();
  const withdraw = useMutation({
    mutationFn: cancelPendingChange,
    onSuccess: () => {
      refresh();
      toast({ variant: 'success', title: t('withdrawn') });
    },
    onError: () => toast({ variant: 'error', title: t('withdrawFailed') }),
  });
  const pending = subscription.pendingChange;
  if (pending === null || pending.awaitingPayment) return null;
  const interval: PlanInterval = pending.interval === 'YEAR' ? 'YEAR' : 'MONTH';
  const when =
    pending.effectiveAt == null
      ? ''
      : format.dateTime(new Date(pending.effectiveAt), { dateStyle: 'long', timeZone: KYIV });
  const text =
    pending.kind === 'DOWNGRADE'
      ? t('pending', {
          date: when,
          title: pending.offerTitle,
          price: planPrice({ price: pending.price, interval }),
        })
      : t('pendingSwitch', {
          date: when,
          interval: pending.interval,
          amount: formatMoney(format.number, pending.price),
        });
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-control bg-subtle py-2 pr-2 pl-3 text-sm">
      <p className="flex items-start gap-2 text-pretty">
        <RefreshCw aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>{text}</span>
      </p>
      <Button
        variant="ghost"
        aria-disabled={withdraw.isPending || undefined}
        onClick={() => {
          if (!withdraw.isPending) withdraw.mutate();
        }}
      >
        {t('withdraw')}
      </Button>
    </div>
  );
}
