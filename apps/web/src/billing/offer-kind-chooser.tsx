'use client';

// Design pass (owner remark, billing M4 round 2026-10-15: «план и пак рядом и сильно путают»;
// frontend-design, ui-ux-pro-max, responsive-design). «Тарифи» asks first which kind of purchase
// fits, as two option cards (the settings theme picker's `OptionCard`: one tab stop, arrows,
// a check on the chosen one), and shows only that kind's offers below: a pack for one event,
// paid once, or a subscription for an organiser's many events. Side by side from `sm`, stacked
// on phones with the icon beside the words (a short card, so the offers stay near the top); each
// card says the deal in one line, the picture is the kind's icon.
import { OptionCard, OptionCardGroup } from '@stepler/ui/components/option-card';
import { CalendarHeart, Repeat, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OfferKind } from './billing-tab';

const KINDS: { value: OfferKind; icon: LucideIcon }[] = [
  { value: 'packs', icon: CalendarHeart },
  { value: 'subscriptions', icon: Repeat },
];

export function OfferKindChooser({
  value,
  onChange,
}: {
  value: OfferKind;
  onChange: (kind: OfferKind) => void;
}) {
  const t = useTranslations('billing.offerKind');
  return (
    <section aria-labelledby="offer-kind-title" className="grid gap-3">
      <h2 id="offer-kind-title" className="type-h2">
        {t('title')}
      </h2>
      <OptionCardGroup
        aria-labelledby="offer-kind-title"
        value={value}
        onValueChange={(next) => onChange(next as OfferKind)}
        className="sm:grid-flow-row sm:grid-cols-2 xl:grid-cols-3"
      >
        {KINDS.map(({ value: kind, icon: Icon }) => (
          <OptionCard
            key={kind}
            value={kind}
            title={t(`${kind}.title`)}
            description={t(`${kind}.description`)}
            preview={
              <span className="grid size-10 place-items-center rounded-control bg-info-soft text-link">
                <Icon className="size-5" />
              </span>
            }
            className="max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:items-center max-sm:pr-10 sm:p-4"
          />
        ))}
      </OptionCardGroup>
    </section>
  );
}
