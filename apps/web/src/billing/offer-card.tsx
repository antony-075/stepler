// Design pass (owner's pick 2026-10-16: «Тарифи» from direction A «Графіт Преміум»; frontend-design,
// ui-ux-pro-max, web-design-guidelines, responsive-design; DESIGN-SYSTEM.md §0.12). One card for
// every offer on «Тарифи» and /pricing, read top to bottom the way an owner decides on a phone:
// - the name large with its one line, then the price as the one big thing (`PRICE`, tabular) with
//   its unit beside it («/ міс», «разово»), a plan's yearly saving under it; shown in $ or € (a
//   reference price, owner 2026-10-16) the price reads «≈ $25» and one line under it says what
//   is paid in hryvnias («Оплата в гривнях: 1 000 ₴/міс»): payment and receipt are always UAH;
// - a pack's three facts as tiles (storage, collecting, keeping) under a ticket's perforation, a
//   plan's facts as a check list under a hairline;
// - the action full width (52px), the slot `action` filled by the section;
// - `highlighted` (the offer's flag, set in /ops): the page's one dark surface (`FEATURED`), an
//   accent outline and the «Найпопулярніший» ribbon on its top edge, in words, not colour alone.
//   The rest are light cards (`CARD`) with a soft lift.
// Works in server and client components alike (next-intl's sync hooks).
import { cn } from '@stepler/ui/lib/utils';
import { Check } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatStorage } from '@/format/bytes';
import { formatMoney, type PricedOffer, retentionYears } from './offers';
import { CARD, FEATURED, PRICE, PRICE_UNIT } from './surfaces';

/** The filled button of a card: dark on a light card, light on the featured one. */
export function offerButtonClass(highlighted: boolean): string {
  return cn(
    'h-13 w-full rounded-[0.875rem] text-base font-semibold',
    highlighted
      ? 'bg-inverse-foreground text-inverse hover:bg-inverse-muted'
      : 'bg-foreground text-background hover:bg-foreground-soft',
  );
}

/** The colours inside a card: on the light card, or on the featured dark one. */
const TONE = {
  light: {
    muted: 'text-muted-foreground',
    tile: 'bg-muted',
    rule: 'border-border',
    check: 'text-link',
    dash: 'border-border',
  },
  featured: {
    muted: 'text-inverse-muted',
    tile: 'bg-white/8',
    rule: 'border-white/10',
    check: 'text-inverse-ring',
    dash: 'border-white/18',
  },
} as const;

export interface OfferTile {
  value: string;
  label: string;
}

/** The shared offer card: name, price and unit, the facts, the action. */
export function OfferCard({
  testId,
  title,
  price,
  unit,
  description,
  saving,
  charged = null,
  facts = [],
  tiles,
  action,
  highlighted = false,
}: {
  testId: string;
  title: string;
  price: string;
  unit: string;
  description?: string | null;
  /** A plan's yearly saving under the price («−17% · Економія 2 000 ₴ на рік»). */
  saving?: ReactNode;
  /** Shown in $ or €: what is really paid, in hryvnias («1 000 ₴/міс»); `null` in hryvnias. */
  charged?: string | null;
  facts?: string[];
  /** A pack's facts as tiles under a perforation (storage, collecting, keeping). */
  tiles?: OfferTile[];
  action: ReactNode;
  highlighted?: boolean;
}) {
  const t = useTranslations('billing.plans');
  const tone = highlighted ? TONE.featured : TONE.light;
  return (
    <article
      className={cn(
        'relative flex h-full flex-col',
        highlighted ? cn(FEATURED, 'outline-2 -outline-offset-2 outline-primary') : CARD,
      )}
      data-testid={testId}
      data-highlighted={highlighted || undefined}
    >
      {highlighted ? (
        <span className="absolute -top-3.5 left-6 inline-flex h-7 items-center rounded-full bg-primary px-3.5 text-[0.8125rem] font-semibold text-primary-foreground">
          {t('popular')}
        </span>
      ) : null}
      <div className="grid gap-5 p-6 sm:p-7">
        <div className="grid gap-1.5">
          <h3 className="text-[1.625rem] leading-tight font-bold">{title}</h3>
          {description == null ? null : (
            <p className={cn('text-[0.9375rem] text-pretty', tone.muted)}>{description}</p>
          )}
        </div>
        <div className="grid gap-2">
          <p className="flex flex-wrap items-baseline gap-x-2">
            {charged === null ? null : (
              <span className={cn('text-2xl font-semibold', tone.muted)}>{t('approx')}</span>
            )}
            <span className={PRICE}>{price}</span>
            <span className={cn(PRICE_UNIT, tone.muted)}>{unit}</span>
          </p>
          {charged === null ? null : (
            <p data-slot="charged-uah" className={cn('text-sm', tone.muted)}>
              {t('charged', { price: charged })}
            </p>
          )}
          {saving == null ? null : <div className="text-sm text-pretty">{saving}</div>}
        </div>
      </div>
      {tiles === undefined ? null : <Perforation dash={tone.dash} />}
      <div
        className={cn(
          'mt-auto grid gap-5 px-6 pb-6 sm:px-7 sm:pb-7',
          tiles !== undefined && 'pt-5',
        )}
      >
        {tiles === undefined ? null : (
          <ul className="grid grid-cols-3 gap-2 text-center">
            {tiles.map((tile) => (
              <li key={tile.label} className={cn('grid gap-0.5 rounded-xl px-1 py-2.5', tone.tile)}>
                <span className="text-base font-bold tabular-nums">{tile.value}</span>
                <span className={cn('text-xs', tone.muted)}>{tile.label}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="grid">{action}</div>
        {facts.length === 0 ? null : (
          <ul className={cn('grid gap-3 border-t pt-5 text-[0.9375rem]', tone.rule)}>
            {facts.map((fact) => (
              <li key={fact} className="flex items-start gap-2.5">
                <Check
                  aria-hidden="true"
                  strokeWidth={2.4}
                  className={cn('mt-0.5 size-4.5 shrink-0', tone.check)}
                />
                <span className="text-pretty">{fact}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** A ticket's tear line under the price: a dashed rule (decorative). */
function Perforation({ dash }: { dash: string }) {
  return (
    <div aria-hidden="true" className="mx-6 sm:mx-7">
      <span className={cn('block border-t-2 border-dashed', dash)} />
    </div>
  );
}

export function PackCard({ pack, action }: { pack: PricedOffer; action: ReactNode }) {
  const t = useTranslations('billing.pack');
  const format = useFormatter();
  const { limits } = pack.offer;
  const storage =
    limits.collectionStorageBytes === null ? null : Number(limits.collectionStorageBytes);
  const years = limits.retentionDays === null ? null : retentionYears(limits.retentionDays);
  const tiles: OfferTile[] = [];
  if (storage !== null) {
    tiles.push({ value: formatStorage(format.number, storage), label: t('tiles.storage') });
  }
  if (limits.windowDays !== null) {
    tiles.push({ value: t('tiles.days', { days: limits.windowDays }), label: t('tiles.window') });
  }
  if (limits.retentionDays !== null) {
    tiles.push({
      value:
        years === null
          ? t('tiles.days', { days: limits.retentionDays })
          : t('tiles.years', { years }),
      label: t('tiles.retention'),
    });
  }
  const facts = limits.guestLinks === null ? [] : [t('links', { count: limits.guestLinks })];
  return (
    <OfferCard
      testId={`pack-${pack.offer.code}`}
      title={pack.offer.title}
      price={formatMoney(format.number, pack.display)}
      charged={
        pack.display.currency === pack.price.currency
          ? null
          : formatMoney(format.number, pack.price)
      }
      unit={t('oneTime')}
      description={pack.offer.description}
      tiles={tiles}
      facts={facts}
      action={action}
      highlighted={pack.offer.highlighted}
    />
  );
}
