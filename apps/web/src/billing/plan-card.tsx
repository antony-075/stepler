'use client';

// Design pass (billing page v2, owner 2026-10-08: «красива, в тому ж стилі»; frontend-design,
// ui-ux-pro-max, web-design-guidelines, responsive-design). The account's plan as the first panel:
// - «Ваш тариф» small, then the plan's name as the panel's heading with its state as a badge in
//   words (Активний / Пробний / Лише перегляд / Пільговий період);
// - one line for time: «Діє до 15 жовтня 2026 · залишилось 4 дні» (the count in mono), or why it
//   ended; the period bar is drawn only when the period's start is known (a subscription's
//   `currentPeriodStart`, M3): `/me/usage` gives the end only, and a bar with a guessed start
//   would lie;
// - the action that fits: «Купити пакет» jumps to the packs below; filled when the account is
//   read-only or the trial is in its last days, outline otherwise (M3 adds «Змінити тариф» here);
// - «Що буде після завершення?»: four short lines. Open and tinted when it already happened
//   (read-only) or is close; otherwise a closed disclosure, so the panel stays quiet.
import type { Access } from '@stepler/contracts';
import { Badge, type BadgeVariant } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { focusRing } from '@stepler/ui/lib/focus';
import { cn } from '@stepler/ui/lib/utils';
import { ChevronDown, CreditCard, Download, Hourglass, MailWarning, UserX } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { daysLeft, TRIAL_REMINDER_DAYS } from '@/app/app/access-model';
import { UsageBar } from '@/app/app/usage-bar';
import { monoDigits } from '@/format/mono-digits';

const KYIV = 'Europe/Kyiv';
const DAY_MS = 24 * 3600_000;
const WARNING_TEXT = 'font-medium text-warning';
const MUTED_TEXT = 'text-muted-foreground';

/** The id the packs section carries, for «Купити пакет». */
export const PACKS_SECTION_ID = 'packs';

type Translate = ReturnType<typeof useTranslations<'billing'>>;

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

function stateBadge(t: Translate, access: Access): { variant: BadgeVariant; label: string } {
  if (access.state === 'READ_ONLY') return { variant: 'warning', label: t('states.READ_ONLY') };
  if (access.state === 'GRACE') return { variant: 'warning', label: t('states.GRACE') };
  if (access.reason === 'TRIAL') return { variant: 'info', label: t('plan.trialBadge') };
  return { variant: 'success', label: t(`states.${access.state}`) };
}

export function PlanCard({
  access,
  periodStart = null,
  planTitle = null,
}: {
  access: Access;
  /** The paid period's start, when known (a subscription, M3); draws the period bar. */
  periodStart?: string | null;
  /** The live plan's name («Pro»), in place of the generic «Підписка». */
  planTitle?: string | null;
}) {
  const t = useTranslations('billing');
  const format = useFormatter();
  const now = useNow({ updateInterval: 3600_000 });
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: KYIV });
  const readOnly = access.state === 'READ_ONLY';
  const days = access.endsAt === null || readOnly ? null : daysLeft(access.endsAt, now);
  const closeToEnd = days !== null && days <= TRIAL_REMINDER_DAYS;
  const attention = readOnly || closeToEnd;
  const badge = stateBadge(t, access);

  let time: ReactNode;
  if (readOnly || access.reason === 'SUBSCRIPTION_PAST_DUE') {
    time = reasonText(t, access, date);
  } else if (access.endsAt === null) {
    time = t('plan.open');
  } else {
    time = (
      <>
        <span>{t('plan.until', { date: date(access.endsAt) })}</span>
        {days === null ? null : (
          <>
            <span aria-hidden="true" className="h-3 w-px bg-border-strong max-sm:hidden" />
            <span className={closeToEnd ? WARNING_TEXT : MUTED_TEXT}>
              {monoDigits(t('plan.daysLeft', { days }), 'font-mono text-[0.875rem] tabular-nums')}
            </span>
          </>
        )}
      </>
    );
  }

  const span =
    periodStart === null || access.endsAt === null
      ? null
      : {
          used: Math.max(0, now.getTime() - new Date(periodStart).getTime()) / DAY_MS,
          limit: (new Date(access.endsAt).getTime() - new Date(periodStart).getTime()) / DAY_MS,
        };

  return (
    <Panel data-slot="plan-card" className="h-full">
      <PanelContent className="flex h-full flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="grid min-w-0 gap-1.5">
            <p className="text-sm text-muted-foreground">{t('plan.title')}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="type-h2">
                {planTitle !== null && access.reason !== 'TRIAL' && access.reason !== 'TRIAL_ENDED'
                  ? planTitle
                  : planName(t, access.reason)}
              </h2>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.9375rem] text-foreground-soft">
              {time}
            </p>
          </div>
          <Button asChild variant={attention ? 'default' : 'outline'} className="max-sm:w-full">
            <a href={`#${PACKS_SECTION_ID}`}>
              <CreditCard aria-hidden="true" />
              {t('plan.buyPack')}
            </a>
          </Button>
        </div>
        {span === null ? null : <UsageBar {...span} className="h-1.5 w-full bg-border" />}
        <AfterEnd readOnly={readOnly} open={attention} />
      </PanelContent>
    </Panel>
  );
}

const AFTER_LINES = [
  { key: 'guests', icon: UserX },
  { key: 'you', icon: Download },
  { key: 'kept', icon: Hourglass },
  { key: 'warned', icon: MailWarning },
] as const;

/** What read-only means and how long content is kept, in four short lines. */
function AfterEnd({ readOnly, open }: { readOnly: boolean; open: boolean }) {
  const t = useTranslations('billing.after');
  const lines = (
    <ul className="grid gap-2 text-sm text-foreground-soft">
      {AFTER_LINES.map(({ key, icon: Icon }) => (
        <li key={key} className="flex items-start gap-2.5">
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="text-pretty">{t(key)}</span>
        </li>
      ))}
    </ul>
  );
  const title = readOnly ? t('readOnlyTitle') : t('title');

  if (open) {
    return (
      <section
        aria-label={title}
        className="mt-auto grid gap-2.5 rounded-control bg-warning-soft p-3.5 sm:p-4"
      >
        <h3 className="text-sm font-semibold">{title}</h3>
        {lines}
      </section>
    );
  }
  return (
    <details className="group mt-auto border-t pt-3">
      <summary
        className={cn(
          '-mx-1 flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control px-1 text-sm font-medium text-foreground-soft md:min-h-8 [&::-webkit-details-marker]:hidden',
          focusRing,
        )}
      >
        {title}
        <ChevronDown
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform duration-(--duration-fast) group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="pt-2 pb-1">{lines}</div>
    </details>
  );
}

function reasonText(t: Translate, access: Access, date: (iso: string) => string): string {
  const until = access.endsAt === null ? '' : date(access.endsAt);
  switch (access.reason) {
    case 'SUBSCRIPTION_PAST_DUE':
      return t('reasons.SUBSCRIPTION_PAST_DUE', { date: until });
    case 'TRIAL_ENDED':
    case 'SUBSCRIPTION_ENDED':
      return t(`reasons.${access.reason}`);
    default:
      return t('reasons.NONE');
  }
}
