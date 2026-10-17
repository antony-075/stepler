'use client';

// Design pass (billing page v4, the owner's reference 2026-10-09; frontend-design,
// web-design-guidelines). What the owner can do with the plan, on «Ваш тариф»
// (DESIGN-SYSTEM.md §0.12; direction C's Overview artboard, owner 2026-10-16): on the right of the
// card's heading row, the one main action as a compact dark button (last; first and full width on
// phones), the rest as quiet ghost buttons before it:
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
import { RefreshCw } from 'lucide-react';
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
/** The main action: dark and compact (44px), the first and full width on phones. */
const MAIN =
  'h-11 md:pointer-fine:h-11 md:pointer-fine:px-4 md:pointer-fine:text-[0.9375rem] rounded-xl bg-foreground px-4 font-semibold text-background hover:bg-foreground-soft max-sm:order-first max-sm:w-full sm:order-last';
/** A granted plan's only action, «Купити пакет»: secondary, an outline at the main one's size. */
const SECONDARY =
  'h-11 md:pointer-fine:h-11 md:pointer-fine:px-4 md:pointer-fine:text-[0.9375rem] rounded-xl px-4 font-semibold max-sm:w-full';
const ROW = 'flex flex-wrap items-center gap-2 max-sm:w-full sm:justify-end';
const QUIET = 'h-11 md:pointer-fine:h-11 max-sm:px-2.5';

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
      <div className={ROW}>
        <Button
          asChild
          {...(subscription === null
            ? { className: MAIN }
            : { variant: 'outline', className: SECONDARY })}
        >
          <Link href={billingHref('plans', PACKS_SECTION_ID)}>{t('plan.buyPack')}</Link>
        </Button>
        {subscription === null ? (
          <Button asChild variant="ghost" className={QUIET}>
            <Link href={billingHref('plans', SUBSCRIPTIONS_SECTION_ID)}>
              {t('access.choosePlan')}
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }
  const buyPack = (
    <Button asChild variant="ghost" className={QUIET}>
      <Link href={billingHref('plans', PACKS_SECTION_ID)}>{t('plan.buyPack')}</Link>
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

  const change = changeable ? (
    <Button asChild className={MAIN}>
      <Link href={billingHref('plans')}>{t('change')}</Link>
    </Button>
  ) : (
    <Button variant="ghost" className={QUIET} disabled aria-describedby={reasonId}>
      {t('change')}
    </Button>
  );

  return (
    <>
      {status === 'CANCELED' ? (
        <div className={ROW}>
          {resumePlan === null ? null : (
            <Button className={MAIN} onClick={() => setResuming(true)}>
              {t('resume')}
            </Button>
          )}
          {buyPack}
        </div>
      ) : (
        <div className={ROW}>
          {payable ? (
            <Button className={MAIN} onClick={() => setPaying(true)}>
              {t('payNow')}
            </Button>
          ) : null}
          {change}
          {buyPack}
          <Button variant="ghost" className={QUIET} onClick={() => setConfirming(true)}>
            {t('cancel')}
          </Button>
          {changeable ? null : (
            <p id={reasonId} className="basis-full text-sm text-muted-foreground sm:text-right">
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
