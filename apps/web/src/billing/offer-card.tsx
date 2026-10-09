// Design pass (billing page v4, the owner's reference 2026-10-09; frontend-design, ui-ux-pro-max,
// web-design-guidelines, responsive-design). One card system for every offer on «Тарифи» and
// /pricing, read top to bottom the way an owner decides on a phone (DESIGN-SYSTEM.md §0.12):
// - its name, then the price as the one large thing (Golos Text with tabular figures: the price
//   carries «₴», DESIGN-SYSTEM.md §0.11) with its unit beside it («/міс», «одноразово»);
// - the facts in plain words, each after an accent circle-check (decorative: the words carry it);
// - the action as a slot at the bottom, full width so the thumb finds it, 44px on touch screens;
// - `highlighted` (the offer's flag, set in /ops from M4): the accent border and a
//   «Найпопулярніший» tag in the corner, in words, not colour alone.
// Works in server and client components alike (next-intl's sync hooks).
import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { cn } from '@stepler/ui/lib/utils';
import { CircleCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatStorage } from '@/format/bytes';
import { formatMoney, type PricedOffer, retentionYears } from './offers';

/** The shared offer card: name, price and unit, the facts, the action. */
export function OfferCard({
  testId,
  title,
  price,
  unit,
  description,
  facts,
  action,
  highlighted = false,
}: {
  testId: string;
  title: string;
  price: string;
  unit: string;
  description?: string | null;
  facts: string[];
  action: ReactNode;
  highlighted?: boolean;
}) {
  const t = useTranslations('billing.plans');
  return (
    <Panel
      className={cn('relative h-full', highlighted && 'border-primary ring-1 ring-primary')}
      data-testid={testId}
      data-highlighted={highlighted || undefined}
    >
      {highlighted ? (
        <span className="absolute -top-px -right-px rounded-tr-sheet rounded-bl-control bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
          {t('popular')}
        </span>
      ) : null}
      <PanelContent className="flex h-full flex-col gap-5">
        <div className="grid gap-1.5">
          <h3 className={cn('text-lg font-semibold', highlighted && 'pr-28')}>{title}</h3>
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[2rem] leading-tight font-bold tracking-tight tabular-nums">
              {price}
            </span>
            <span className="text-sm text-muted-foreground">{unit}</span>
          </p>
          {description == null ? null : (
            <p className="text-sm text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
        <ul className="grid gap-2.5 text-foreground-soft">
          {facts.map((fact) => (
            <li key={fact} className="flex items-start gap-2.5">
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-link" />
              <span className="text-pretty">{fact}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto grid pt-1">{action}</div>
      </PanelContent>
    </Panel>
  );
}

export function PackCard({ pack, action }: { pack: PricedOffer; action: ReactNode }) {
  const t = useTranslations('billing.pack');
  const format = useFormatter();
  const { limits } = pack.offer;
  const storage =
    limits.collectionStorageBytes === null ? null : Number(limits.collectionStorageBytes);
  const years = limits.retentionDays === null ? null : retentionYears(limits.retentionDays);
  const facts: string[] = [];
  if (storage !== null) {
    facts.push(t('storage', { size: formatStorage(format.number, storage) }));
  }
  if (limits.windowDays !== null) facts.push(t('window', { days: limits.windowDays }));
  if (limits.retentionDays !== null) {
    facts.push(
      years === null
        ? t('retentionDays', { days: limits.retentionDays })
        : t('retentionYears', { years }),
    );
  }
  if (limits.guestLinks !== null) facts.push(t('links', { count: limits.guestLinks }));
  return (
    <OfferCard
      testId={`pack-${pack.offer.code}`}
      title={pack.offer.title}
      price={formatMoney(format.number, pack.price)}
      unit={t('oneTime')}
      description={pack.offer.description}
      facts={facts}
      action={action}
      highlighted={pack.offer.highlighted}
    />
  );
}
