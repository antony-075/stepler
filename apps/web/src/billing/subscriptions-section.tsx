'use client';

// Design pass (billing page v4, the owner's reference 2026-10-09; the owner's pick 2026-10-16,
// direction A, with prices per currency; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). The heading row also holds «₴ / $ / €» (`CurrencySwitch`): the cards show
// reference prices in $ or € for orientation, every plan is still bought in hryvnias. The
// subscriptions group of «Тарифи»: the heading with
// «Щомісяця / Щороку» on the same row (under it when the row is too narrow), one caption that
// says once that a plan renews until cancelled, the plan cards in the same auto-fit grid as the
// packs (17rem minimum: one column on phones, side by side from tablets). Every card ends in one
// full-width filled button, what that plan means for this account: «Оформити» without a paid
// plan, «Перейти на цей тариф» for a subscriber (the change dialog with the server's preview), a
// disabled «Ваш тариф» on the current one; in grace and when cancelled the buttons wait, with the
// reason under the cards.
import type { BillingSummary, Currency, OfferList } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { SUBSCRIPTIONS_SECTION_ID } from './billing-tab';
import { ChangePlanDialog } from './change-plan-dialog';
import { CurrencySwitch, shownCurrency } from './currency';
import { offerButtonClass } from './offer-card';
import { type PlanInterval, planIntervals, type PricedPlan, subscriptionPlans } from './offers';
import { IntervalSwitch, SubscriptionPlanCard } from './plan-picker';
import { SubscribeDialog } from './subscribe-dialog';
import { SECTION_NOTE, SECTION_TITLE } from './surfaces';

export function SubscriptionsSection({
  offers,
  summary,
  collectionTitles,
  currency: chosenCurrency,
  onCurrencyChange,
}: {
  offers: { data: OfferList | undefined; isPending: boolean };
  summary: BillingSummary | undefined;
  collectionTitles: Map<string, string>;
  /** The currency the cards show (payment is in hryvnias whatever it is). */
  currency: Currency;
  onCurrencyChange: (currency: Currency) => void;
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
  const currency = shownCurrency(list, chosenCurrency);
  if (!askedHandled && asked !== null && list !== undefined && summary !== undefined) {
    setAskedHandled(true);
    const plan = (['MONTH', 'YEAR'] as const)
      .flatMap((each) => subscriptionPlans(list, each, currency))
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
  const plans = list === undefined ? [] : subscriptionPlans(list, shown, currency);
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
    <section
      id={SUBSCRIPTIONS_SECTION_ID}
      aria-labelledby="plans-title"
      className="grid scroll-mt-20 gap-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="grid gap-1">
          <h2 id="plans-title" className={SECTION_TITLE}>
            {t('title')}
          </h2>
          <p className={SECTION_NOTE}>{t('intro')}</p>
        </div>
        {list === undefined ? null : (
          <div className="flex flex-wrap items-start gap-3">
            <IntervalSwitch
              offers={list}
              currency={currency}
              value={shown}
              onChange={setPlanInterval}
            />
            <CurrencySwitch offers={list} value={currency} onChange={onCurrencyChange} />
          </div>
        )}
      </div>
      {list === undefined ? (
        <div className="grid gap-6 md:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-96 w-full rounded-[1.25rem]" />
          <Skeleton className="h-96 w-full rounded-[1.25rem] max-md:hidden" />
        </div>
      ) : (
        <>
          <ul className="grid gap-6 pt-2 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const current =
                paid !== null && paid.offerId === plan.offer.id && paid.interval === plan.interval;
              const button = offerButtonClass(plan.offer.highlighted);
              let action;
              if (current) {
                action = (
                  <Button className={button} disabled>
                    {t('current')}
                  </Button>
                );
              } else if (paid === null) {
                action = (
                  <Button className={button} onClick={() => setChosen({ plan, mode: 'subscribe' })}>
                    {t('subscribe')}
                  </Button>
                );
              } else if (waitReason !== null) {
                action = (
                  <Button className={button} disabled aria-describedby={reasonId}>
                    {t('change')}
                  </Button>
                );
              } else {
                action = (
                  <Button className={button} onClick={() => setChosen({ plan, mode: 'change' })}>
                    {t('change')}
                  </Button>
                );
              }
              return (
                <li key={plan.priceId}>
                  <SubscriptionPlanCard plan={plan} action={action} />
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
