'use client';

// Design pass (billing M3, Task 18; frontend-design, responsive-design). The subscriptions on
// `/pricing`: the same plan cards and «Щомісяця / Щороку» control as «Тариф і оплата», so a plan
// reads the same in both places. No payment starts here: signed in, «Оформити» opens «Тариф і
// оплата» with that plan's subscribe dialog (`?plan=`), where the auto-renewal consent is given;
// signed out it goes to sign-in first.
import type { OfferList } from '@stepler/contracts';
import { buttonVariants } from '@stepler/ui/components/button';
import { cn } from '@stepler/ui/lib/utils';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CurrencySwitch, shownCurrency, useBillingCurrency } from './currency';
import { offerButtonClass } from './offer-card';
import { type PlanInterval, planIntervals, subscriptionPlans } from './offers';
import { IntervalSwitch, SubscriptionPlanCard } from './plan-picker';
import { GROUP_NOTE, GROUP_TITLE } from './surfaces';

export function PricingPlans({
  offers,
  signedIn,
  titleAs: Title = 'h2',
}: {
  offers: OfferList;
  signedIn: boolean;
  /** `h3` inside the landing's «Ціни» section. */
  titleAs?: 'h2' | 'h3';
}) {
  const t = useTranslations('billing.plans');
  const [chosen, setCurrency] = useBillingCurrency();
  const currency = shownCurrency(offers, chosen);
  const intervals = planIntervals(offers);
  const [picked, setPlanInterval] = useState<PlanInterval>('MONTH');
  const interval = intervals.includes(picked) ? picked : (intervals[0] ?? 'MONTH');
  const plans = subscriptionPlans(offers, interval, currency);
  if (plans.length === 0) return null;
  return (
    <section aria-labelledby="plans-title" className="grid gap-6">
      <div className="grid gap-1">
        <Title id="plans-title" className={GROUP_TITLE}>
          {t('title')}
        </Title>
        <p className={GROUP_NOTE}>{t('intro')}</p>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <IntervalSwitch
          offers={offers}
          currency={currency}
          value={interval}
          onChange={setPlanInterval}
        />
        <CurrencySwitch offers={offers} value={currency} onChange={setCurrency} />
      </div>
      <ul className="grid gap-6 pt-2 md:grid-cols-2">
        {plans.map((plan) => (
          <li key={plan.priceId}>
            <SubscriptionPlanCard
              plan={plan}
              action={
                <Link
                  href={planHref(signedIn, plan.priceId)}
                  className={cn(buttonVariants(), offerButtonClass(plan.offer.highlighted))}
                >
                  {signedIn ? t('subscribe', { title: plan.offer.title }) : t('signIn')}
                </Link>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Signed out: sign in first (sign-in carries no return path, slice 9 [P8]). */
function planHref(signedIn: boolean, priceId: string): string {
  return signedIn ? `/app/billing?plan=${encodeURIComponent(priceId)}` : '/login';
}
