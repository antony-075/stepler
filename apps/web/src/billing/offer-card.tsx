// Design pass (owner's pick 2026-10-16: «Тарифи» one to one with direction A's artboards, Plans
// and PlansPhone; frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design;
// DESIGN-SYSTEM.md §0.12). The offer cards of «Тарифи» and /pricing, read top to bottom the way an
// owner decides on a phone, one card for plans and packs alike:
// - `PlanCard`: the name large with its one line, the price as the one big thing (44px, tabular)
//   with «/ міс» or «разово» beside it; yearly, the price per month with the year's sum, the twelve
//   monthly prices struck through and the saving pill under it; the action (52px, an ink outline);
//   the limits as a check list under a hairline;
// - `PackCard`: the same card for a pack (owner's feedback 2026-10-16: «что это за билеты?» — no
//   ticket), its facts as check rows: «10 ГБ сховища», «30 днів збору», «1 рік зберігання»;
// - shown in $ or € (a reference price, owner 2026-10-16) the price reads «≈ $25» and one line
//   under it says what is paid in hryvnias («Оплата в гривнях: 1 000 ₴/міс»). That line's place
//   in hryvnias says how it is charged instead («Без автоматичних списань»; a plan «Продовжується
//   автоматично…»), so it is never an empty gap; the yearly line's place is kept, so switching the
//   currency or the period never moves the button or the list (the owner's «скачет»);
// - `highlighted` (the offer's flag, set in /ops): the page's one dark surface (`FEATURED`), an
//   accent outline with an accent glow and the «Найпопулярніший» ribbon on its top edge, in words,
//   not colour alone; its button is white.
// Works in server and client components alike (next-intl's sync hooks).
import { cn } from '@stepler/ui/lib/utils';
import { Check } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
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
    rule: 'border-muted',
    check: 'text-link',
  },
  featured: {
    muted: 'text-inverse-muted/75',
    soft: 'text-inverse-muted',
    struck: 'text-inverse-muted/55',
    saving: 'bg-[rgb(34_197_94/0.18)] text-[#86efac]',
    rule: 'border-white/10',
    check: 'text-inverse-ring',
  },
} as const;

type Tone = (typeof TONE)[keyof typeof TONE];

const LIGHT_PLAN =
  'border bg-card text-card-foreground shadow-[0_1px_2px_rgb(24_24_27/0.04),0_12px_32px_-18px_rgb(24_24_27/0.18)]';
const FEATURED_EDGE =
  'outline-2 -outline-offset-2 outline-primary shadow-[0_24px_48px_-24px_color-mix(in_srgb,var(--primary)_55%,transparent)]';

/** The offer's own words from /ops, or «Найпопулярніший». */
function Ribbon({ text }: { text: string | null }) {
  const t = useTranslations('billing.plans');
  return (
    <span className="absolute -top-3.5 left-7.5 inline-flex h-7 max-w-[calc(100%-3.75rem)] items-center truncate rounded-full bg-primary px-3.5 text-[0.8125rem] font-semibold text-primary-foreground">
      {text ?? t('popular')}
    </span>
  );
}

/** «≈ $25» when shown in $ or €, else the price alone. */
function Price({
  price,
  unit,
  approx,
  tone,
}: {
  price: string;
  unit: string;
  approx: boolean;
  tone: Tone;
}) {
  const t = useTranslations('billing.plans');
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      {approx ? (
        <span className={cn('text-2xl leading-none font-semibold', tone.muted)}>{t('approx')}</span>
      ) : null}
      <span className="text-[2.75rem] leading-none font-bold tracking-[-0.02em] tabular-nums">
        {price}
      </span>
      <span className={cn('text-[0.9375rem] leading-none', tone.muted)}>{unit}</span>
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
  chargeNote,
  yearly = null,
  yearlySlot = false,
  facts,
  action,
  highlighted = false,
  ribbon = null,
}: {
  testId: string;
  title: string;
  description?: string | null;
  price: string;
  unit: string;
  /** Shown in $ or €: what is really paid, in hryvnias («1 000 ₴/міс»); `null` in hryvnias. */
  charged?: string | null;
  /** In hryvnias, the line under the price says how it is charged («Без автоматичних списань»). */
  chargeNote: string;
  yearly?: YearlyLine | null;
  /** Keep the yearly line's place while it is empty (a list with the period switch). */
  yearlySlot?: boolean;
  facts: ReactNode[];
  action: ReactNode;
  highlighted?: boolean;
  /** The ribbon's words on a highlighted card; `null` is «Найпопулярніший». */
  ribbon?: string | null;
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
      {highlighted ? <Ribbon text={ribbon} /> : null}
      <div className="grid gap-1.5">
        <h3 className="text-[1.625rem] leading-tight font-bold">{title}</h3>
        {description == null ? null : (
          <p className={cn('text-[0.9375rem] text-pretty', tone.muted)}>{description}</p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Price price={price} unit={unit} approx={charged !== null} tone={tone} />
        {yearly === null ? (
          yearlySlot ? (
            <span aria-hidden="true" className="h-6" />
          ) : null
        ) : (
          // One line at any width, so the period switch never moves the card: on narrower cards the
          // struck twelve months give way (the saving pill says it); at 320px it may run into the
          // card's padding rather than widen the card (`w-0 min-w-full`).
          <p className="flex h-6 w-0 min-w-full items-center gap-2 text-[0.8125rem] whitespace-nowrap xl:text-sm">
            <span className={tone.soft}>{t('yearlyTotal', { price: yearly.total })}</span>
            <s className={cn(tone.struck, 'max-xl:hidden')}>{yearly.full}</s>
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
        <p
          data-slot="charged-uah"
          className={cn('min-h-5 text-sm leading-5 tabular-nums', tone.muted)}
        >
          {charged === null ? chargeNote : t('charged', { price: charged })}
        </p>
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

const bold = (chunks: ReactNode): ReactElement => <b className="font-semibold">{chunks}</b>;

/** A pack: the plan card with «разово» and the pack's facts as check rows. */
export function PackCard({ pack, action }: { pack: PricedOffer; action: ReactNode }) {
  const t = useTranslations('billing.pack');
  const format = useFormatter();
  const { limits } = pack.offer;
  const facts: ReactNode[] = [];
  if (limits.collectionStorageBytes !== null) {
    const size = formatStorage(format.number, Number(limits.collectionStorageBytes));
    facts.push(t.rich('facts.storage', { size, b: bold }));
  }
  if (limits.windowDays !== null) {
    facts.push(t.rich('facts.window', { days: limits.windowDays, b: bold }));
  }
  if (limits.retentionDays !== null) {
    const years = retentionYears(limits.retentionDays);
    facts.push(
      years === null
        ? t.rich('facts.retentionDays', { days: limits.retentionDays, b: bold })
        : t.rich('facts.retentionYears', { years, b: bold }),
    );
  }
  if (limits.guestLinks !== null) facts.push(t('links', { count: limits.guestLinks }));
  return (
    <PlanCard
      testId={`pack-${pack.offer.code}`}
      title={pack.offer.title}
      description={pack.offer.description}
      price={formatMoney(format.number, pack.display)}
      unit={t('oneTime')}
      chargeNote={t('chargeNote')}
      charged={
        pack.display.currency === pack.price.currency
          ? null
          : formatMoney(format.number, pack.price)
      }
      facts={facts}
      action={action}
      highlighted={pack.offer.highlighted}
      ribbon={pack.offer.ribbon}
    />
  );
}
