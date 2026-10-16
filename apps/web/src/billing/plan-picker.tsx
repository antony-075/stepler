'use client';

// Design pass (billing M3, Task 18; the owner's pick 2026-10-16, direction A's Plans artboard;
// frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design). Subscriptions are for
// event businesses (B5):
// - the price is per month at either interval («833 ₴ / міс»); yearly, the line under it says
//   what one payment is («10 000 ₴ щороку»), the twelve monthly prices struck through and the
//   saving as a pill; that a plan renews until cancelled is said once, under the cards;
// - the facts are the account's limits, the number in bold: active collections first (what a
//   business counts), then storage, per-collection storage only when it is smaller, links, then
//   what every plan has;
// - «Щомісяця / Щороку −17%» is a pill switch in the group's heading row, not a toggle inside each
//   card, so both plans always compare at the same interval;
// - the current plan says so in words (its button, «Ваш тариф»), the offer's `highlighted`
//   flag adds «Найпопулярніший».
import type { Currency, Money, OfferList } from '@stepler/contracts';
import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatStorage } from '@/format/bytes';
import { PlanCard } from './offer-card';
import {
  bestYearlyPercent,
  formatMoney,
  type PlanInterval,
  planIntervals,
  type PricedPlan,
  yearlySaving,
} from './offers';

/** The «Щороку» pill with its «−17%» inside: less padding on the right, as the artboard. */
const WITH_TAG = 'pr-2';

export function IntervalSwitch({
  offers,
  currency,
  value,
  onChange,
}: {
  offers: OfferList;
  currency: Currency;
  value: PlanInterval;
  onChange: (interval: PlanInterval) => void;
}) {
  const t = useTranslations('billing.plans');
  const intervals = planIntervals(offers);
  const percent = bestYearlyPercent(offers, currency);
  if (intervals.length < 2) return null;
  return (
    <ToggleGroup
      variant="pill"
      aria-label={t('intervalLabel')}
      value={value}
      onValueChange={(next) => {
        if (next !== '') onChange(next as PlanInterval);
      }}
      className="justify-self-start"
    >
      {intervals.map((interval) => (
        <ToggleGroupItem
          key={interval}
          value={interval}
          className={interval === 'YEAR' && percent !== null ? WITH_TAG : undefined}
        >
          {t(`intervals.${interval}`)}
          {interval === 'YEAR' && percent !== null ? (
            <DiscountTag
              text={t('yearlyPercent', { percent })}
              label={t('yearlyBadgeLabel', { percent })}
            />
          ) : null}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * «−17%» inside the «Щороку» pill: always visible, so the monthly view already invites the
 * switch. Success-tinted like a saving (DESIGN-SYSTEM.md §0.5 soft fills, 4.5:1 in both themes);
 * the spoken label says the words.
 */
function DiscountTag({ text, label }: { text: string; label: string }) {
  return (
    <span
      data-testid="yearly-discount"
      className="ml-2 inline-flex h-6.5 items-center rounded-full bg-success-soft px-2.5 text-[0.8125rem] font-semibold text-success tabular-nums"
    >
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** «499,00 ₴/міс» */
export function usePlanPrice(): (plan: Pick<PricedPlan, 'price' | 'interval'>) => string {
  const t = useTranslations('billing.plans');
  const format = useFormatter();
  return (plan) => t(`per.${plan.interval}`, { price: formatMoney(format.number, plan.price) });
}

/** «833 ₴», not «833,33 ₴»: the monthly share of a yearly price is for comparison only. */
function wholeUnits(money: Money): Money {
  return { ...money, amountMinor: Math.round(money.amountMinor / 100) * 100 };
}

const bold = (chunks: ReactNode) => <b className="font-semibold">{chunks}</b>;

export function SubscriptionPlanCard({ plan, action }: { plan: PricedPlan; action: ReactNode }) {
  const t = useTranslations('billing.plans');
  const tPack = useTranslations('billing.pack');
  const format = useFormatter();
  const money = (value: Parameters<typeof formatMoney>[1]) => formatMoney(format.number, value);
  const { limits } = plan.offer;
  const size = (bytes: string) => formatStorage(format.number, Number(bytes));
  const facts: ReactNode[] = [];
  if (limits.activeCollections !== null) {
    facts.push(t.rich('collections', { count: limits.activeCollections, b: bold }));
  }
  if (limits.storageBytes !== null) {
    facts.push(t.rich('storage', { size: size(limits.storageBytes), b: bold }));
  }
  if (
    limits.collectionStorageBytes !== null &&
    limits.storageBytes !== null &&
    BigInt(limits.collectionStorageBytes) < BigInt(limits.storageBytes)
  ) {
    facts.push(t.rich('collectionStorage', { size: size(limits.collectionStorageBytes), b: bold }));
  }
  if (limits.guestLinks !== null) facts.push(tPack('links', { count: limits.guestLinks }));
  facts.push(t('everyPlan.guests'), t('everyPlan.pages'));
  const saving = plan.interval === 'YEAR' ? yearlySaving(plan.offer, plan.display.currency) : null;
  // Yearly in the shown currency: the price per month large, the year's payment under it.
  const perMonth = saving !== null && saving.perMonth.currency === plan.display.currency;
  return (
    <PlanCard
      testId={`plan-${plan.offer.code}`}
      title={plan.offer.title}
      description={plan.offer.description}
      price={money(perMonth ? wholeUnits(saving.perMonth) : plan.display)}
      unit={t(`unit.${perMonth ? 'MONTH' : plan.interval}`)}
      chargeNote={t('chargeNote')}
      charged={
        plan.display.currency === plan.price.currency
          ? null
          : t(`per.${plan.interval}`, { price: money(plan.price) })
      }
      yearly={
        perMonth
          ? {
              total: money(plan.display),
              full: money({
                amountMinor: saving.saving.amountMinor + plan.display.amountMinor,
                currency: plan.display.currency,
              }),
              saving: money(saving.saving),
            }
          : null
      }
      yearlySlot
      facts={facts}
      action={action}
      highlighted={plan.offer.highlighted}
    />
  );
}
