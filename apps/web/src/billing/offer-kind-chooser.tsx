'use client';

// Design pass (owner remark, billing M4 round 2026-10-15: «план и пак рядом и сильно путают»;
// frontend-design, ui-ux-pro-max, responsive-design). «Тарифи» asks first which kind of purchase
// fits, as two option cards (the shared `OptionCard`: one tab stop, arrows), and shows only that
// kind's offers below: a pack for one event, paid once, or a subscription for an organiser's many
// events. As direction A's artboards (owner 2026-10-16): the icon tile beside the words, the
// chosen card with a 2px accent edge and a soft accent ring (no check badge; `aria-checked` says
// it), its tile tinted; two side by side up to 760px wide, stacked on phones.
import { OptionCard, OptionCardGroup } from '@stepler/ui/components/option-card';
import { CalendarHeart, Repeat, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OfferKind } from './billing-tab';

/** A's chooser card over the shared `OptionCard`: a row, the accent edge and ring when chosen. */
const CARD =
  'grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[0.875rem] p-3.5 hover:border-input sm:items-start sm:gap-3.5 sm:rounded-2xl sm:p-4.5 data-[state=checked]:border-primary data-[state=checked]:shadow-[inset_0_0_0_1px_var(--primary),0_0_0_4px_var(--info-soft)] data-[state=checked]:focus-visible:border-primary [&>[data-slot=option-card-check]]:hidden [&>span:nth-child(2)]:gap-1 [&>span:nth-child(2)]:p-0 [&>span:nth-child(2)>span:first-child]:text-[0.9375rem] sm:[&>span:nth-child(2)>span:first-child]:text-base max-sm:[&>span:nth-child(2)>span:last-child]:text-[0.8125rem]';

const KINDS: { value: OfferKind; icon: LucideIcon }[] = [
  { value: 'subscriptions', icon: Repeat },
  { value: 'packs', icon: CalendarHeart },
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
    <section aria-labelledby="offer-kind-title" className="grid gap-2.5 sm:gap-3.5">
      <h2 id="offer-kind-title" className="text-[1.0625rem] font-semibold sm:text-[1.1875rem]">
        {t('title')}
      </h2>
      <OptionCardGroup
        aria-labelledby="offer-kind-title"
        value={value}
        onValueChange={(next) => onChange(next as OfferKind)}
        className="max-w-190 gap-2.5 sm:grid-flow-row sm:grid-cols-2 sm:gap-3.5"
      >
        {KINDS.map(({ value: kind, icon: Icon }) => (
          <OptionCard
            key={kind}
            value={kind}
            title={t(`${kind}.title`)}
            description={t(`${kind}.description`)}
            preview={
              <span className="grid size-9 place-items-center rounded-[0.625rem] bg-muted text-foreground-soft group-data-[state=checked]/option:bg-info-soft group-data-[state=checked]/option:text-link sm:size-10 sm:rounded-xl">
                <Icon className="size-5" />
              </span>
            }
            className={CARD}
          />
        ))}
      </OptionCardGroup>
    </section>
  );
}
