'use client';

// Design pass (billing page v4, the owner's reference 2026-10-09; frontend-design, ui-ux-pro-max,
// web-design-guidelines). «Ваш тариф» on «Огляд»: ONE card for the plan (DESIGN-SYSTEM.md §0.12):
// - «Ваш тариф» small, the plan's name large and one badge: the subscription's own (Діє /
//   Скасовано / Очікує оплати / Надано Stepler) when there is one, else the access state
//   (Пробний / Активний / Лише перегляд);
// - one line for time and money: «Наступне списання 9 листопада | 500,00 ₴/міс», «Доступ до …»
//   when cancelled, «Оплатіть до …» in grace, «Діє до … | залишилось N днів» (the days in the
//   accent, amber in the last 3) for a trial. The long explanation is the tab's one alert;
// - «Залишилось» on the right: days, hours and minutes in three tiles until the date that matters
//   (the trial's or a granted plan's end, a cancelled plan's access, the grace's end), never for
//   a plan that renews by itself. It ticks each minute (`useNow`); screen readers get one
//   sentence, the tiles are hidden from them;
// - a scheduled change as its own quiet row with «Скасувати зміну»; the period bar for a plan;
// - the actions (`PlanActions`: one full-width main action, a quiet row under it), then «Що буде
//   після завершення?» as an accent-tinted disclosure, open only when the end is close or has
//   happened.
// Owner's pick 2026-10-16 (direction C, unified with the page, `surfaces.ts`): the card in the
// page's CARD; the plan's name at 32px with its badge; for a paid or granted plan a period line
// with its start, «Сьогодні · день N з M» and its end with what it brings, over the bar; a monthly
// plan that is sold yearly too gets one strip under it: «−17%», what a year costs instead of
// twelve months, «Перейти на щорічну» (the change dialog on «Тарифи», `?plan=`).
import type { BillingSummary, OfferList, SubscriptionDto } from '@stepler/contracts';
import { Badge, type BadgeVariant } from '@stepler/ui/components/badge';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { ChevronDown, Info } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { daysLeft, TRIAL_REMINDER_DAYS } from '@/app/app/access-model';
import { UsageBar } from '@/app/app/usage-bar';
import { monoDigits } from '@/format/mono-digits';
import { BILLING_PATH } from './billing-tab';
import {
  formatMoney,
  type PlanInterval,
  type PricedPlan,
  subscriptionPlans,
  yearlySaving,
} from './offers';
import { PendingChange, PlanActions } from './plan-actions';
import { usePlanPrice } from './plan-picker';
import { CARD, CHIP } from './surfaces';

const KYIV = 'Europe/Kyiv';
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 3600_000;
const MONO = 'font-mono text-[0.875rem] tabular-nums';

type Translate = ReturnType<typeof useTranslations<'billing'>>;
type Access = BillingSummary['access'];

function planName(t: Translate, reason: Access['reason']): string {
  switch (reason) {
    case 'TRIAL':
    case 'TRIAL_ENDED':
      return t('plan.names.TRIAL');
    case 'SUBSCRIPTION':
    case 'SUBSCRIPTION_PAST_DUE':
    case 'SUBSCRIPTION_ENDED':
      return t('plan.names.SUBSCRIPTION');
    case 'COMPLIMENTARY':
      return t('plan.names.COMPLIMENTARY');
    default:
      return t('plan.names.NONE');
  }
}

function badgeOf(
  t: Translate,
  access: Access,
  subscription: SubscriptionDto | null,
): { variant: BadgeVariant; label: string } {
  if (subscription !== null) {
    if (subscription.source === 'COMPLIMENTARY') {
      return { variant: 'success', label: t('subscription.status.granted') };
    }
    if (subscription.status === 'CANCELED') {
      return { variant: 'neutral', label: t('subscription.status.canceled') };
    }
    if (subscription.status === 'PAST_DUE') {
      return { variant: 'warning', label: t('subscription.status.pastDue') };
    }
    return { variant: 'success', label: t('subscription.status.active') };
  }
  if (access.state === 'READ_ONLY') return { variant: 'warning', label: t('states.READ_ONLY') };
  if (access.state === 'GRACE') return { variant: 'warning', label: t('states.GRACE') };
  if (access.reason === 'TRIAL') return { variant: 'info', label: t('plan.trialBadge') };
  return { variant: 'success', label: t(`states.${access.state}`) };
}

/** A cancelled or unpaid plan's offer at its price, when still sold («Відновити», «Оплатити»). */
function resumePlanOf(
  subscription: SubscriptionDto | null,
  offers: OfferList | undefined,
): PricedPlan | null {
  if (subscription === null || offers === undefined || subscription.interval === null) return null;
  if (subscription.status !== 'CANCELED' && subscription.status !== 'PAST_DUE') return null;
  const interval: PlanInterval = subscription.interval === 'YEAR' ? 'YEAR' : 'MONTH';
  return (
    subscriptionPlans(offers, interval).find((plan) => plan.offer.id === subscription.offerId) ??
    null
  );
}

export function PlanCard({
  summary,
  offers,
}: {
  summary: BillingSummary;
  offers: OfferList | undefined;
}) {
  const t = useTranslations('billing');
  const format = useFormatter();
  const now = useNow({ updateInterval: MINUTE_MS });
  const planPrice = usePlanPrice();
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: KYIV });
  const { access, subscription } = summary;
  const readOnly = access.state === 'READ_ONLY';
  const days = access.endsAt === null || readOnly ? null : daysLeft(access.endsAt, now);
  const closeToEnd = subscription === null && days !== null && days <= TRIAL_REMINDER_DAYS;
  const attention = readOnly || closeToEnd;
  const badge = badgeOf(t, access, subscription);
  const trial = access.reason === 'TRIAL' || access.reason === 'TRIAL_ENDED';
  const title =
    subscription !== null && !trial ? subscription.offerTitle : planName(t, access.reason);

  // The headline: days rounded up (`daysLeft`, the app-wide rule); the tiles below stay exact.
  const daysNote =
    days === null ? null : (
      <span className={cn('font-medium', closeToEnd ? 'text-warning' : 'text-link')}>
        {monoDigits(t('plan.daysLeft', { days }), MONO)}
      </span>
    );
  // Read-only without a plan has no line: the tab's alert says why, the badge says the state.
  let parts: ReactNode[] = [];
  if (subscription !== null && !trial) {
    parts = subscriptionLine(t, subscription, now, date, planPrice);
  } else if (!readOnly) {
    parts =
      access.endsAt === null
        ? [t('plan.open')]
        : [t('plan.until', { date: date(access.endsAt) }), daysNote];
  }
  parts = parts.filter((part) => part !== null && part !== '');

  const countdownEnd = readOnly ? null : countdownTarget(access, subscription);

  const periodStart =
    subscription !== null && (access.reason === 'SUBSCRIPTION' || access.reason === 'COMPLIMENTARY')
      ? subscription.currentPeriodStart
      : null;
  const span =
    periodStart === null || access.endsAt === null
      ? null
      : {
          used: Math.max(0, now.getTime() - new Date(periodStart).getTime()) / DAY_MS,
          limit: (new Date(access.endsAt).getTime() - new Date(periodStart).getTime()) / DAY_MS,
        };

  return (
    <section data-slot="plan-card" aria-label={t('plan.title')} className={cn(CARD, 'p-6 sm:p-7')}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="grid min-w-0 gap-2">
            <p className="text-sm text-muted-foreground">{t('plan.title')}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="text-[2rem] leading-tight font-bold tracking-tight">{title}</h2>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
            {parts.length === 0 ? null : (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.9375rem] text-foreground-soft">
                {parts.map((part, index) => (
                  <Part key={index} first={index === 0}>
                    {typeof part === 'string' ? monoDigits(part, MONO) : part}
                  </Part>
                ))}
              </p>
            )}
          </div>
          {countdownEnd === null ? null : <Countdown end={countdownEnd} now={now} />}
        </div>
        {subscription === null ? null : <PendingChange subscription={subscription} />}
        {span === null || periodStart === null || access.endsAt === null ? null : (
          <PeriodLine
            start={date(periodStart)}
            end={date(access.endsAt)}
            day={Math.min(Math.ceil(span.used), Math.round(span.limit))}
            days={Math.round(span.limit)}
            span={span}
            renews={subscription?.source === 'LIQPAY' && subscription.status === 'ACTIVE'}
          />
        )}
        <YearlyUpsell subscription={subscription} offers={offers} />
        <PlanActions summary={summary} resumePlan={resumePlanOf(subscription, offers)} />
        <AfterEnd readOnly={readOnly} open={attention} />
      </div>
    </section>
  );
}

/**
 * The plan's period: its start, «Сьогодні · день N з M» and its end (what happens then: the
 * charge for a plan that renews, the end otherwise), over the bar. The words carry it; the bar
 * is decorative.
 */
function PeriodLine({
  start,
  end,
  day,
  days,
  span,
  renews,
}: {
  start: string;
  end: string;
  day: number;
  days: number;
  span: { used: number; limit: number };
  renews: boolean;
}) {
  const t = useTranslations('billing.plan.period');
  return (
    <div data-slot="plan-period" className="grid gap-2.5">
      <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-foreground-soft">
        <span>{t('start', { date: start })}</span>
        <span className="font-semibold text-foreground">
          {monoDigits(t('today', { day: Math.max(1, day), days }), MONO)}
        </span>
        <span>{renews ? t('renews', { date: end }) : t('ends', { date: end })}</span>
      </p>
      <UsageBar {...span} className="h-2.5 w-full bg-muted" />
    </div>
  );
}

/**
 * A monthly plan sold yearly too: «−17%», what the year costs instead of twelve months, and the
 * way to switch («Перейти на щорічну» opens that plan's change dialog on «Тарифи»).
 */
function YearlyUpsell({
  subscription,
  offers,
}: {
  subscription: SubscriptionDto | null;
  offers: OfferList | undefined;
}) {
  const t = useTranslations('billing.plan.yearly');
  const format = useFormatter();
  if (
    offers === undefined ||
    subscription === null ||
    subscription.source !== 'LIQPAY' ||
    subscription.status !== 'ACTIVE' ||
    subscription.interval !== 'MONTH' ||
    subscription.price === null ||
    subscription.pendingChange !== null
  ) {
    return null;
  }
  const currency = subscription.price.currency;
  const yearly = subscriptionPlans(offers, 'YEAR', currency).find(
    (plan) => plan.offer.id === subscription.offerId,
  );
  const saving = yearly === undefined ? null : yearlySaving(yearly.offer, currency);
  if (yearly === undefined || saving === null) return null;
  const twelve = { amountMinor: subscription.price.amountMinor * 12, currency };
  return (
    <div
      data-slot="plan-yearly"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-info-soft px-4 py-3.5"
    >
      <span className={cn(CHIP, 'bg-primary text-primary-foreground')}>
        {t('percent', { percent: saving.percent })}
      </span>
      <p className="min-w-0 flex-1 basis-64 text-[0.9375rem] text-pretty">
        {t('text', {
          year: formatMoney(format.number, yearly.price),
          twelve: formatMoney(format.number, twelve),
        })}
      </p>
      <Link
        href={`${BILLING_PATH}?tab=plans&plan=${encodeURIComponent(yearly.priceId)}`}
        className={cn('min-h-11 content-center font-semibold text-link hover:underline', focusRing)}
      >
        {t('action')}
      </Link>
    </div>
  );
}

/**
 * The date the countdown runs to, or null: the trial's (or no plan's) end, a granted plan's end,
 * a cancelled plan's access, the grace's end. A plan that renews by itself has none.
 */
function countdownTarget(access: Access, subscription: SubscriptionDto | null): string | null {
  if (subscription === null || subscription.source !== 'LIQPAY') return access.endsAt;
  if (subscription.status === 'CANCELED') return subscription.currentPeriodEnd;
  if (subscription.status === 'PAST_DUE') return subscription.graceEndsAt;
  return null;
}

/** «Залишилось»: days, hours, minutes in three tiles; one sentence for screen readers. */
function Countdown({ end, now }: { end: string; now: Date }) {
  const t = useTranslations('billing.plan.countdown');
  const left = new Date(end).getTime() - now.getTime();
  if (left <= 0) return null;
  const minutesTotal = Math.floor(left / MINUTE_MS);
  const days = Math.floor(minutesTotal / (24 * 60));
  const hours = Math.floor((minutesTotal % (24 * 60)) / 60);
  const minutes = minutesTotal % 60;
  const tiles = [
    { value: days, label: t('days') },
    { value: hours, label: t('hours') },
    { value: minutes, label: t('minutes') },
  ];
  return (
    <div data-slot="plan-countdown" className="grid gap-1.5">
      <p aria-hidden="true" className="text-sm text-muted-foreground">
        {t('label')}
      </p>
      <p className="sr-only">{t('summary', { days, hours, minutes })}</p>
      <div aria-hidden="true" className="flex gap-2">
        {tiles.map((tile) => (
          <span
            key={tile.label}
            className="grid min-w-14 justify-items-center gap-0.5 rounded-control border border-border bg-subtle px-2 py-2"
          >
            <span className="text-lg leading-none font-semibold tabular-nums">{tile.value}</span>
            <span className="text-xs text-muted-foreground">{tile.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** One fact of the time line, after a thin divider (hidden on phones, where they wrap). */
function Part({ first, children }: { first: boolean; children: ReactNode }) {
  return (
    <>
      {first ? null : (
        <span aria-hidden="true" className="h-3 w-px bg-border-strong max-sm:hidden" />
      )}
      <span>{children}</span>
    </>
  );
}

/** The live plan's time line: what is charged and when, or the one thing to know. */
function subscriptionLine(
  t: Translate,
  subscription: SubscriptionDto,
  now: Date,
  date: (iso: string) => string,
  planPrice: ReturnType<typeof usePlanPrice>,
): ReactNode[] {
  const end = subscription.currentPeriodEnd;
  const pending = subscription.pendingChange;
  if (subscription.source !== 'LIQPAY') {
    return [
      end === null
        ? t('subscription.grantedOpen')
        : t('subscription.grantedUntil', { date: date(end) }),
    ];
  }
  const interval: PlanInterval = subscription.interval === 'YEAR' ? 'YEAR' : 'MONTH';
  const price =
    subscription.price === null || subscription.interval === null ? null : (
      <span key="price" className="font-medium text-foreground tabular-nums">
        {planPrice({ price: subscription.price, interval })}
      </span>
    );
  if (subscription.status === 'CANCELED') {
    return [end === null ? '' : t('plan.accessUntil', { date: date(end) })];
  }
  if (pending?.awaitingPayment === true) {
    const until = subscription.graceEndsAt ?? end;
    return [until === null ? '' : t('plan.switchAwaiting', { date: date(until) })];
  }
  if (subscription.status === 'PAST_DUE') {
    const grace = subscription.graceEndsAt;
    const graceDate = grace === null ? '' : date(grace);
    if (grace !== null && new Date(grace).getTime() <= now.getTime()) {
      return [
        <span key="grace" className="font-medium text-warning">
          {t('plan.graceOver')}
        </span>,
        price,
      ];
    }
    return [
      <span key="grace" className="font-medium text-warning">
        {monoDigits(t('plan.payBy', { date: graceDate }), MONO)}
      </span>,
      price,
    ];
  }
  return [end === null ? '' : t('subscription.next', { date: date(end) }), price];
}

const AFTER_LINES = ['guests', 'you', 'kept', 'warned'] as const;

/**
 * What read-only means and how long content is kept, as one short paragraph in an accent-tinted
 * disclosure: open when the end is close or has happened (the tab's alert carries the warning).
 */
function AfterEnd({ readOnly, open }: { readOnly: boolean; open: boolean }) {
  const t = useTranslations('billing.after');
  return (
    <details className="group rounded-control bg-info-soft" open={open}>
      <summary
        className={cn(
          'flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-control px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden',
          focusRing,
        )}
      >
        <Info aria-hidden="true" className="size-5 shrink-0 text-link" />
        <span className="min-w-0 flex-1">{readOnly ? t('readOnlyTitle') : t('title')}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground transition-transform duration-(--duration-fast) group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <p className="-mt-1 max-w-[65ch] px-4 pb-4 pl-12 text-sm text-pretty text-foreground-soft">
        {AFTER_LINES.map((key) => t(key)).join(' ')}
      </p>
    </details>
  );
}
