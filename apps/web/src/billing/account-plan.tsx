'use client';

// Design pass (billing page v3, owner 2026-10-09: «сторінка дуже насичена текстом… все в одній
// купі»; frontend-design, ui-ux-pro-max, web-design-guidelines, responsive-design). «Ваш тариф» on
// «Огляд»: ONE card for the plan, where v2 had the plan and «Підписка» side by side saying the
// same things twice (DESIGN-SYSTEM.md §0.12):
// - «Ваш тариф» small, the plan's name as the heading and one badge: the subscription's own
//   (Діє / Скасовано / Очікує оплати / Надано Stepler) when there is one, else the access state
//   (Пробний / Активний / Лише перегляд);
// - one line for time and money: «Наступне списання 9 листопада · 500,00 ₴/міс», «Доступ до …»
//   when cancelled, «Оплатіть до …» in grace, «Діє до … · залишилось N днів» for a trial, or the
//   short reason when it ended. The long explanation is the tab's one alert, never repeated here;
// - a scheduled change as its own quiet row with «Скасувати зміну»;
// - the period bar when the period's start is known (a subscription);
// - the actions that apply (`PlanActions`), then «Що буде після завершення?», open only when the
//   end is close or has happened.
import type { BillingSummary, OfferList, SubscriptionDto } from '@stepler/contracts';
import { Badge, type BadgeVariant } from '@stepler/ui/components/badge';
import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { ChevronDown, Download, Hourglass, MailWarning, UserX } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { daysLeft, TRIAL_REMINDER_DAYS } from '@/app/app/access-model';
import { UsageBar } from '@/app/app/usage-bar';
import { monoDigits } from '@/format/mono-digits';
import { type PlanInterval, type PricedPlan, subscriptionPlans } from './offers';
import { PendingChange, PlanActions } from './plan-actions';
import { usePlanPrice } from './plan-picker';

const KYIV = 'Europe/Kyiv';
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
  const now = useNow({ updateInterval: 3600_000 });
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

  const daysNote =
    days === null ? null : (
      <span className={closeToEnd ? 'font-medium text-warning' : 'text-muted-foreground'}>
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
    <Panel data-slot="plan-card" className="h-full">
      <PanelContent className="flex h-full flex-col gap-4">
        <div className="grid min-w-0 gap-1.5">
          <p className="text-sm text-muted-foreground">{t('plan.title')}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="type-h2">{title}</h2>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          {parts.length === 0 ? null : (
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.9375rem] text-foreground-soft">
              {parts.map((part, index) => (
                <Part key={index} first={index === 0}>
                  {typeof part === 'string' ? monoDigits(part, MONO) : part}
                </Part>
              ))}
            </p>
          )}
        </div>
        {subscription === null ? null : <PendingChange subscription={subscription} />}
        {span === null ? null : <UsageBar {...span} className="h-1.5 w-full bg-border" />}
        <PlanActions
          summary={summary}
          resumePlan={resumePlanOf(subscription, offers)}
          attention={attention}
        />
        <AfterEnd readOnly={readOnly} open={attention} />
      </PanelContent>
    </Panel>
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

const AFTER_LINES = [
  { key: 'guests', icon: UserX },
  { key: 'you', icon: Download },
  { key: 'kept', icon: Hourglass },
  { key: 'warned', icon: MailWarning },
] as const;

/**
 * What read-only means and how long content is kept, in four short lines: a disclosure, open
 * when the end is close or has happened (the tab's alert carries the warning itself).
 */
function AfterEnd({ readOnly, open }: { readOnly: boolean; open: boolean }) {
  const t = useTranslations('billing.after');
  return (
    <details className="group mt-auto border-t pt-3" open={open}>
      <summary
        className={cn(
          '-mx-1 flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control px-1 text-sm font-medium text-foreground-soft md:min-h-8 [&::-webkit-details-marker]:hidden',
          focusRing,
        )}
      >
        {readOnly ? t('readOnlyTitle') : t('title')}
        <ChevronDown
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform duration-(--duration-fast) group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <ul className="grid gap-2 pt-2 pb-1 text-sm text-foreground-soft">
        {AFTER_LINES.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-start gap-2.5">
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="text-pretty">{t(key)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
