// Design pass (owner's pick 2026-10-16: «Тарифи» one to one with direction A's artboards, Plans
// and PlansPhone; frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design;
// DESIGN-SYSTEM.md §0.12). The offer cards of «Тарифи» and /pricing, read top to bottom the way an
// owner decides on a phone:
// - `PlanCard` (a subscription): the name large with its one line, the price as the one big thing
//   (44px, tabular) with «/ міс» beside it; yearly, the price per month with the year's sum, the
//   twelve monthly prices struck through and the saving pill under it; the action (52px, an ink
//   outline); the limits as a check list under a hairline;
// - `PackCard` (a ticket): the name as a small uppercase label, the price (38px) «разово» and the
//   one line, a dashed tear line with the page's colour biting the two sides, the three facts as
//   tiles, the action «Купити «Старт»»;
// - shown in $ or € (a reference price, owner 2026-10-16) the price reads «≈ $25» and one line
//   under it says what is paid in hryvnias («Оплата в гривнях: 1 000 ₴/міс»);
// - `highlighted` (the offer's flag, set in /ops): the page's one dark surface (`FEATURED`), an
//   accent outline with an accent glow and the «Найпопулярніший» ribbon on its top edge (left on a
//   plan, right on a ticket), in words, not colour alone; its button is white.
// Works in server and client components alike (next-intl's sync hooks).
import { cn } from '@stepler/ui/lib/utils';
import { Check } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatStorage } from '@/format/bytes';
import { formatMoney, type PricedOffer, retentionYears } from './offers';
import { FEATURED } from './surfaces';

/** A card's button: an ink outline on a light card, white on the featured one. 52px. */
export function offerButtonClass(highlighted: boolean): string {
  return cn(
    'h-13 w-full rounded-[0.875rem] text-base font-semibold md:pointer-fine:h-13 md:pointer-fine:text-base',
    highlighted
      ? 'border-0 bg-inverse-foreground text-inverse hover:bg-inverse-muted'
      : 'border border-foreground bg-card text-foreground hover:bg-muted',
  );
}

/** The colours inside a card: on the light card, or on the featured dark one. */
const TONE = {
  light: {
    muted: 'text-muted-foreground',
    soft: 'text-foreground-soft',
    struck: 'text-muted-foreground/70',
    saving: 'bg-success-soft text-success',
    tile: 'bg-muted',
    rule: 'border-muted',
    check: 'text-link',
    dash: 'border-border',
  },
  featured: {
    muted: 'text-inverse-muted/75',
    soft: 'text-inverse-muted',
    struck: 'text-inverse-muted/55',
    saving: 'bg-[rgb(34_197_94/0.18)] text-[#86efac]',
    tile: 'bg-white/8',
    rule: 'border-white/10',
    check: 'text-inverse-ring',
    dash: 'border-white/18',
  },
} as const;

type Tone = (typeof TONE)[keyof typeof TONE];

const LIGHT_PLAN =
  'border bg-card text-card-foreground shadow-[0_1px_2px_rgb(24_24_27/0.04),0_12px_32px_-18px_rgb(24_24_27/0.18)]';
const LIGHT_TICKET =
  'border bg-card text-card-foreground shadow-[0_12px_28px_-18px_rgb(24_24_27/0.25)]';
const FEATURED_EDGE =
  'outline-2 -outline-offset-2 outline-primary shadow-[0_24px_48px_-24px_color-mix(in_srgb,var(--primary)_55%,transparent)]';

function Ribbon({ side }: { side: 'left' | 'right' }) {
  const t = useTranslations('billing.plans');
  return (
    <span
      className={cn(
        'absolute -top-3.5 inline-flex h-7 items-center rounded-full bg-primary px-3.5 text-[0.8125rem] font-semibold text-primary-foreground',
        side === 'left' ? 'left-7.5' : 'right-5.5',
      )}
    >
      {t('popular')}
    </span>
  );
}

/** «≈ $25» when shown in $ or €, else the price alone. */
function Price({
  price,
  unit,
  approx,
  tone,
  size,
}: {
  price: string;
  unit: string;
  approx: boolean;
  tone: Tone;
  size: 'plan' | 'ticket';
}) {
  const t = useTranslations('billing.plans');
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      {approx ? (
        <span className={cn('text-2xl font-semibold', tone.muted)}>{t('approx')}</span>
      ) : null}
      <span
        className={cn(
          'leading-none font-bold tabular-nums',
          size === 'plan' ? 'text-[2.75rem] tracking-[-0.02em]' : 'text-[2.375rem]',
        )}
      >
        {price}
      </span>
      <span className={cn(size === 'plan' ? 'text-[0.9375rem]' : 'text-sm', tone.muted)}>
        {unit}
      </span>
    </p>
  );
}

/** A plan's yearly line: «10 000 ₴ щороку», the struck «12 000 ₴», the «Економія 2 000 ₴» pill. */
export interface YearlyLine {
  total: string;
  full: string;
  saving: string;
}

export function PlanCard({
  testId,
  title,
  description,
  price,
  unit,
  charged = null,
  yearly = null,
  facts,
  action,
  highlighted = false,
}: {
  testId: string;
  title: string;
  description?: string | null;
  price: string;
  unit: string;
  /** Shown in $ or €: what is really paid, in hryvnias («1 000 ₴/міс»); `null` in hryvnias. */
  charged?: string | null;
  yearly?: YearlyLine | null;
  facts: ReactNode[];
  action: ReactNode;
  highlighted?: boolean;
}) {
  const t = useTranslations('billing.plans');
  const tone = highlighted ? TONE.featured : TONE.light;
  return (
    <article
      className={cn(
        'relative flex h-full flex-col gap-5.5 rounded-3xl p-6 sm:p-7.5',
        highlighted ? cn(FEATURED, 'rounded-3xl', FEATURED_EDGE) : LIGHT_PLAN,
      )}
      data-testid={testId}
      data-highlighted={highlighted || undefined}
    >
      {highlighted ? <Ribbon side="left" /> : null}
      <div className="grid gap-1.5">
        <h3 className="text-[1.625rem] leading-tight font-bold">{title}</h3>
        {description == null ? null : (
          <p className={cn('text-[0.9375rem] text-pretty', tone.muted)}>{description}</p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Price price={price} unit={unit} approx={charged !== null} tone={tone} size="plan" />
        {yearly === null ? null : (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className={tone.soft}>{t('yearlyTotal', { price: yearly.total })}</span>
            <s className={tone.struck}>{yearly.full}</s>
            <span
              className={cn(
                'inline-flex h-6 items-center rounded-full px-2.25 font-semibold tabular-nums',
                tone.saving,
              )}
            >
              {t('savingPill', { saving: yearly.saving })}
            </span>
          </p>
        )}
        {charged === null ? null : (
          <p data-slot="charged-uah" className={cn('text-sm', tone.muted)}>
            {t('charged', { price: charged })}
          </p>
        )}
      </div>
      <div className="mt-auto grid">{action}</div>
      {facts.length === 0 ? null : (
        <ul className={cn('grid gap-3 border-t pt-5 text-[0.9375rem]', tone.rule)}>
          {facts.map((fact, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <Check
                aria-hidden="true"
                strokeWidth={2.2}
                className={cn('size-5 shrink-0', tone.check)}
              />
              <span className="text-pretty">{fact}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export interface OfferTile {
  value: string;
  label: string;
}

/**
 * A ticket's tear line: a dashed rule with a half circle in the page's colour biting each side
 * (decorative). `surface` is the colour the card sits on.
 */
function TearLine({
  dash,
  highlighted,
  surface,
}: {
  dash: string;
  highlighted: boolean;
  surface: string;
}) {
  const notch = cn(
    'absolute -top-3.25 size-6 rounded-full',
    surface,
    highlighted ? null : 'border-border',
  );
  return (
    <div aria-hidden="true" className={cn('relative mx-4.5 h-0 border-t-2 border-dashed', dash)}>
      <span className={cn(notch, '-left-8', !highlighted && 'border-r')} />
      <span className={cn(notch, '-right-8', !highlighted && 'border-l')} />
    </div>
  );
}

export function PackCard({
  pack,
  action,
  surface = 'bg-background',
}: {
  pack: PricedOffer;
  action: ReactNode;
  /** What the card sits on, for the tear line's notches (the page's background by default). */
  surface?: string;
}) {
  const t = useTranslations('billing.pack');
  const tPlans = useTranslations('billing.plans');
  const format = useFormatter();
  const { limits } = pack.offer;
  const highlighted = pack.offer.highlighted;
  const tone = highlighted ? TONE.featured : TONE.light;
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
  const charged =
    pack.display.currency === pack.price.currency ? null : formatMoney(format.number, pack.price);
  return (
    <article
      className={cn(
        'relative flex h-full flex-col rounded-[1.375rem]',
        highlighted ? cn(FEATURED, 'rounded-[1.375rem]', FEATURED_EDGE) : LIGHT_TICKET,
      )}
      data-testid={`pack-${pack.offer.code}`}
      data-highlighted={highlighted || undefined}
    >
      {highlighted ? <Ribbon side="right" /> : null}
      <div className="grid gap-1.5 px-5.5 pt-5.5 pb-4.5">
        <h3
          className={cn('text-[0.8125rem] font-semibold tracking-[0.04em] uppercase', tone.muted)}
        >
          {pack.offer.title}
        </h3>
        <Price
          price={formatMoney(format.number, pack.display)}
          unit={t('oneTime')}
          approx={charged !== null}
          tone={tone}
          size="ticket"
        />
        {charged === null ? null : (
          <p data-slot="charged-uah" className={cn('text-sm', tone.muted)}>
            {tPlans('charged', { price: charged })}
          </p>
        )}
        {pack.offer.description == null ? null : (
          <p className={cn('text-sm text-pretty', tone.soft)}>{pack.offer.description}</p>
        )}
      </div>
      <TearLine dash={tone.dash} highlighted={highlighted} surface={surface} />
      <div className="mt-auto grid gap-4 px-5.5 pt-4.5 pb-5.5">
        {tiles.length === 0 ? null : (
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
      </div>
    </article>
  );
}
