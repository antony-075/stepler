'use client';

// Design pass (billing M3, Task 18; billing page v4; frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design). Subscriptions are for event businesses (B5), so they
// are the same `OfferCard` as the packs and differ only where the deal differs:
// - the price carries its interval right beside it («/міс», «/рік»); that a plan renews until
//   cancelled is said once, in the group's caption, not on every card;
// - the facts are the account's limits: active collections first (what a business counts),
//   then storage for all collections, per-collection storage only when it is smaller, links;
// - «Щомісяця / Щороку» is the existing segmented control beside the group's heading, not a
//   toggle inside each card, so both plans always compare at the same interval;
// - the current plan says so in words (its button, «Ваш тариф»), the offer's `highlighted`
//   flag adds «Найпопулярніший».
import type { OfferList } from '@stepler/contracts';
import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatStorage } from '@/format/bytes';
import { OfferCard } from './offer-card';
import { formatMoney, type PlanInterval, planIntervals, type PricedPlan } from './offers';

export function IntervalSwitch({
  offers,
  value,
  onChange,
}: {
  offers: OfferList;
  value: PlanInterval;
  onChange: (interval: PlanInterval) => void;
}) {
  const t = useTranslations('billing.plans');
  const intervals = planIntervals(offers);
  if (intervals.length < 2) return null;
  return (
    <ToggleGroup
      variant="segmented"
      aria-label={t('intervalLabel')}
      value={value}
      onValueChange={(next) => onChange(next as PlanInterval)}
      className="justify-self-start"
    >
      {intervals.map((interval) => (
        <ToggleGroupItem key={interval} value={interval}>
          {t(`intervals.${interval}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** «499,00 ₴/міс» */
export function usePlanPrice(): (plan: Pick<PricedPlan, 'price' | 'interval'>) => string {
  const t = useTranslations('billing.plans');
  const format = useFormatter();
  return (plan) => t(`per.${plan.interval}`, { price: formatMoney(format.number, plan.price) });
}

export function SubscriptionPlanCard({ plan, action }: { plan: PricedPlan; action: ReactNode }) {
  const t = useTranslations('billing.plans');
  const tPack = useTranslations('billing.pack');
  const format = useFormatter();
  const { limits } = plan.offer;
  const size = (bytes: string) => formatStorage(format.number, Number(bytes));
  const facts: string[] = [];
  if (limits.activeCollections !== null) {
    facts.push(t('collections', { count: limits.activeCollections }));
  }
  if (limits.storageBytes !== null) facts.push(t('storage', { size: size(limits.storageBytes) }));
  if (
    limits.collectionStorageBytes !== null &&
    limits.storageBytes !== null &&
    BigInt(limits.collectionStorageBytes) < BigInt(limits.storageBytes)
  ) {
    facts.push(t('collectionStorage', { size: size(limits.collectionStorageBytes) }));
  }
  if (limits.guestLinks !== null) facts.push(tPack('links', { count: limits.guestLinks }));
  return (
    <OfferCard
      testId={`plan-${plan.offer.code}`}
      title={plan.offer.title}
      price={formatMoney(format.number, plan.price)}
      unit={t(`unit.${plan.interval}`)}
      facts={facts}
      action={action}
      highlighted={plan.offer.highlighted}
    />
  );
}
