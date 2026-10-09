'use client';

// Design pass (billing page v3; frontend-design, web-design-guidelines). What the owner can do
// with the plan, on «Ваш тариф» (DESIGN-SYSTEM.md §0.12): only the actions that apply, the main
// one first and filled, the rest outline, «Скасувати підписку» quiet at the end:
// - no paid plan: «Обрати тариф» (filled when the account is read-only or the trial ends within
//   3 days) and «Купити пакет», both to «Тарифи»;
// - a paid plan: «Оплатити зараз» in grace, «Змінити тариф» (to «Тарифи»; disabled with its
//   reason in grace and while a switch waits for payment), «Купити пакет», «Скасувати підписку»
//   (ConfirmDialog that says until when access stays);
// - cancelled: «Відновити підписку» (the subscribe dialog with the consent again), «Купити пакет»;
// - granted by Stepler: «Купити пакет».
// `PendingChange` is a scheduled change as a quiet row with «Скасувати зміну».
import type { BillingSummary, SubscriptionDto } from '@stepler/contracts';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { BILLING_KEY, cancelPendingChange, cancelSubscription } from '@/api/billing';
import { USAGE_KEY } from '@/api/collections';
import { billingHref, PACKS_SECTION_ID } from './billing-tab';
import { formatMoney, type PlanInterval, type PricedPlan } from './offers';
import { usePlanPrice } from './plan-picker';
import { SubscribeDialog } from './subscribe-dialog';

const KYIV = 'Europe/Kyiv';
const STRETCH = 'max-sm:w-full';

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
  attention,
}: {
  summary: BillingSummary;
  resumePlan: PricedPlan | null;
  /** Read-only, or the trial ends soon: the way out is the filled button. */
  attention: boolean;
}) {
  const t = useTranslations('billing');
  const subscription = summary.subscription;
  const buyPack = (
    <Button asChild variant="outline" className={STRETCH}>
      <Link href={billingHref('plans', PACKS_SECTION_ID)}>
        <CreditCard aria-hidden="true" />
        {t('plan.buyPack')}
      </Link>
    </Button>
  );
  if (subscription === null || subscription.source !== 'LIQPAY') {
    const chooseVariant = attention ? 'default' : 'outline';
    return (
      <div className="flex flex-wrap gap-2">
        {subscription === null ? (
          <Button asChild variant={chooseVariant} className={STRETCH}>
            <Link href={billingHref('plans')}>{t('access.choosePlan')}</Link>
          </Button>
        ) : null}
        {buyPack}
      </div>
    );
  }
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

  return (
    <>
      {status === 'CANCELED' ? (
        <div className="flex flex-wrap gap-2">
          {resumePlan === null ? null : (
            <Button className={STRETCH} onClick={() => setResuming(true)}>
              {t('resume')}
            </Button>
          )}
          {buyPack}
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            {payable ? (
              <Button className={STRETCH} onClick={() => setPaying(true)}>
                {t('payNow')}
              </Button>
            ) : null}
            <Button
              asChild={changeable}
              variant="outline"
              className={STRETCH}
              disabled={!changeable}
              aria-describedby={changeable ? undefined : reasonId}
            >
              {changeable ? <Link href={billingHref('plans')}>{t('change')}</Link> : t('change')}
            </Button>
            {changeable ? buyPack : null}
            <Button
              variant="ghost"
              className={`${STRETCH} sm:ml-auto`}
              onClick={() => setConfirming(true)}
            >
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
