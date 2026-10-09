'use client';

// Design pass (billing page v3, owner 2026-10-09; frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design). The subscriptions group of «Тарифи»: the group's
// heading with one caption that says once that a plan renews until cancelled (the cards no longer
// repeat it), the interval control beside the heading from `md` (under it on phones), the plan
// cards in the same auto-fit grid as the packs (17rem minimum: one column on phones, side by side
// from tablets). The button on each card is what that plan means for this account: «Оформити»
// without a paid plan, «Перейти на цей тариф» for a subscriber (the change dialog with the
// server's preview), nothing but «Ваш тариф» on the current one; in grace and when cancelled the
// cards stay readable but their buttons explain why they wait.
import type { BillingSummary, OfferList } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { ChangePlanDialog } from './change-plan-dialog';
import { type PlanInterval, planIntervals, type PricedPlan, subscriptionPlans } from './offers';
import { IntervalSwitch, SubscriptionPlanCard } from './plan-picker';
import { SubscribeDialog } from './subscribe-dialog';

export function SubscriptionsSection({
  offers,
  summary,
  collectionTitles,
}: {
  offers: { data: OfferList | undefined; isPending: boolean };
  summary: BillingSummary | undefined;
  collectionTitles: Map<string, string>;
}) {
  const t = useTranslations('billing.plans');
  const reasonId = useId();
  const subscription = summary?.subscription ?? null;
  const paid = subscription?.source === 'LIQPAY' ? subscription : null;
  const initial: PlanInterval = paid?.interval === 'YEAR' ? 'YEAR' : 'MONTH';
  const [interval, setPlanInterval] = useState<PlanInterval>(initial);
  const [chosen, setChosen] = useState<{ plan: PricedPlan; mode: 'subscribe' | 'change' } | null>(
    null,
  );
  // `?plan=<priceId>` from /pricing opens that plan's dialog once the offers are here.
  const asked = useSearchParams().get('plan');
  const [askedHandled, setAskedHandled] = useState(false);
  const list = offers.data;
  if (!askedHandled && asked !== null && list !== undefined && summary !== undefined) {
    setAskedHandled(true);
    const plan = (['MONTH', 'YEAR'] as const)
      .flatMap((each) => subscriptionPlans(list, each))
      .find((each) => each.priceId === asked);
    const live = summary.subscription?.source === 'LIQPAY' ? summary.subscription : null;
    const mode =
      live === null
        ? 'subscribe'
        : live.status === 'ACTIVE' && live.pendingChange?.awaitingPayment !== true
          ? 'change'
          : null;
    const same =
      live !== null && live.offerId === plan?.offer.id && live.interval === plan.interval;
    if (plan !== undefined && mode !== null && !same) {
      setPlanInterval(plan.interval);
      setChosen({ plan, mode });
    }
  }
  const intervals = list === undefined ? [] : planIntervals(list);
  const shown: PlanInterval = intervals.includes(interval) ? interval : (intervals[0] ?? 'MONTH');
  const plans = list === undefined ? [] : subscriptionPlans(list, shown);
  if (!offers.isPending && plans.length === 0) return null;

  const waitReason =
    paid?.pendingChange?.awaitingPayment === true
      ? t('waitSwitch')
      : paid?.status === 'PAST_DUE'
        ? t('waitPastDue')
        : paid?.status === 'CANCELED'
          ? t('waitCanceled')
          : null;

  return (
    <section aria-labelledby="plans-title" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="grid gap-1">
          <h2 id="plans-title" className="type-h2">
            {t('title')}
          </h2>
          <p className="max-w-[70ch] text-sm text-pretty text-muted-foreground">{t('intro')}</p>
        </div>
        {list === undefined ? null : (
          <IntervalSwitch offers={list} value={shown} onChange={setPlanInterval} />
        )}
      </div>
      {list === undefined ? (
        <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-80 w-full rounded-sheet" />
          <Skeleton className="h-80 w-full rounded-sheet max-md:hidden" />
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-4">
            {plans.map((plan) => {
              const current =
                paid !== null && paid.offerId === plan.offer.id && paid.interval === plan.interval;
              let action;
              if (current) {
                action = null;
              } else if (paid === null) {
                action = (
                  <Button className="w-full" onClick={() => setChosen({ plan, mode: 'subscribe' })}>
                    {t('subscribe')}
                  </Button>
                );
              } else if (waitReason !== null) {
                action = (
                  <Button className="w-full" variant="outline" disabled aria-describedby={reasonId}>
                    {t('change')}
                  </Button>
                );
              } else {
                action = (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setChosen({ plan, mode: 'change' })}
                  >
                    {t('change')}
                  </Button>
                );
              }
              return (
                <li key={plan.priceId}>
                  <SubscriptionPlanCard plan={plan} current={current} action={action} />
                </li>
              );
            })}
          </ul>
          {waitReason === null ? null : (
            <Alert variant="info" role="status">
              <span id={reasonId}>{waitReason}</span>
            </Alert>
          )}
        </>
      )}
      {chosen === null ? null : chosen.mode === 'subscribe' ? (
        <SubscribeDialog
          key={chosen.plan.priceId}
          plan={chosen.plan}
          open
          onOpenChange={(open) => {
            if (!open) setChosen(null);
          }}
        />
      ) : (
        <ChangePlanDialog
          key={chosen.plan.priceId}
          plan={chosen.plan}
          open
          onOpenChange={(open) => {
            if (!open) setChosen(null);
          }}
          collectionTitles={collectionTitles}
        />
      )}
    </section>
  );
}
