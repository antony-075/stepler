'use client';

// Design pass (billing M3, Task 18; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). Subscriptions are for event businesses (B5), so they read like the pack
// cards (same panel, same type) and differ only where the deal differs:
// - the price carries its interval right beside it («/міс», «/рік»); that a plan renews until
//   cancelled is said once, in the group's caption (billing page v3), not on every card;
// - the facts are the account's limits: active collections first (what a business counts),
//   then storage for all collections, per-collection storage only when it is smaller, links;
// - «Щомісяця / Щороку» is the existing segmented control above the cards, not a toggle inside
//   each card, so both plans always compare at the same interval;
// - the card marks the account's current plan in words («Ваш тариф») rather than with colour.
import type { OfferList } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { ToggleGroup, ToggleGroupItem } from '@stepler/ui/components/toggle-group';
import { FolderOpen, HardDrive, Layers, Link2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatStorage } from '@/format/bytes';
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

export function SubscriptionPlanCard({
  plan,
  current = false,
  action,
}: {
  plan: PricedPlan;
  current?: boolean;
  action: ReactNode;
}) {
  const t = useTranslations('billing.plans');
  const tPack = useTranslations('billing.pack');
  const format = useFormatter();
  const { limits } = plan.offer;
  const size = (bytes: string) => formatStorage(format.number, Number(bytes));
  const facts: { icon: ReactNode; text: string }[] = [];
  if (limits.activeCollections !== null) {
    facts.push({
      icon: <Layers />,
      text: t('collections', { count: limits.activeCollections }),
    });
  }
  if (limits.storageBytes !== null) {
    facts.push({ icon: <HardDrive />, text: t('storage', { size: size(limits.storageBytes) }) });
  }
  if (
    limits.collectionStorageBytes !== null &&
    limits.storageBytes !== null &&
    BigInt(limits.collectionStorageBytes) < BigInt(limits.storageBytes)
  ) {
    facts.push({
      icon: <FolderOpen />,
      text: t('collectionStorage', { size: size(limits.collectionStorageBytes) }),
    });
  }
  if (limits.guestLinks !== null) {
    facts.push({ icon: <Link2 />, text: tPack('links', { count: limits.guestLinks }) });
  }
  return (
    <Panel className="h-full" data-testid={`plan-${plan.offer.code}`}>
      <PanelContent className="flex h-full flex-col gap-5">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="type-h2">{plan.offer.title}</h3>
            {current ? <Badge variant="success">{t('current')}</Badge> : null}
          </div>
          <p className="flex flex-wrap items-baseline gap-x-1">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatMoney(format.number, plan.price)}
            </span>
            <span className="text-sm text-muted-foreground">{t(`unit.${plan.interval}`)}</span>
          </p>
        </div>
        <ul className="grid gap-2.5 text-foreground-soft">
          {facts.map((fact) => (
            <li key={fact.text} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-0.5 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0"
              >
                {fact.icon}
              </span>
              <span className="text-pretty">{fact.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto grid pt-1">{action}</div>
      </PanelContent>
    </Panel>
  );
}
