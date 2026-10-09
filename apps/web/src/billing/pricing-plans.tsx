'use client';

// Design pass (billing M3, Task 18; frontend-design, responsive-design). The subscriptions on
// `/pricing`: the same plan cards and «Щомісяця / Щороку» control as «Тариф і оплата», so a plan
// reads the same in both places. No payment starts here: signed in, «Оформити» opens «Тариф і
// оплата» with that plan's subscribe dialog (`?plan=`), where the auto-renewal consent is given;
// signed out it goes to sign-in first.
import type { OfferList } from '@stepler/contracts';
import { buttonVariants } from '@stepler/ui/components/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type PlanInterval, planIntervals, subscriptionPlans } from './offers';
import { IntervalSwitch, SubscriptionPlanCard } from './plan-picker';

export function PricingPlans({ offers, signedIn }: { offers: OfferList; signedIn: boolean }) {
  const t = useTranslations('billing.plans');
  const intervals = planIntervals(offers);
  const [interval, setPlanInterval] = useState<PlanInterval>(intervals[0] ?? 'MONTH');
  const plans = subscriptionPlans(offers, interval);
  if (plans.length === 0) return null;
  return (
    <section aria-labelledby="plans-title" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="plans-title" className="type-h2">
          {t('title')}
        </h2>
        <p className="max-w-[60ch] text-pretty text-muted-foreground">{t('intro')}</p>
      </div>
      <IntervalSwitch offers={offers} value={interval} onChange={setPlanInterval} />
      <ul className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => (
          <li key={plan.priceId}>
            <SubscriptionPlanCard
              plan={plan}
              action={
                <Link
                  href={planHref(signedIn, plan.priceId)}
                  className={buttonVariants({ variant: 'outline', className: 'w-full' })}
                >
                  {signedIn ? t('subscribe') : t('signIn')}
                </Link>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Signed out: sign in first (magic links carry no return path, slice 9 [P8]). */
function planHref(signedIn: boolean, priceId: string): string {
  return signedIn ? `/app/billing?plan=${encodeURIComponent(priceId)}` : '/login';
}
