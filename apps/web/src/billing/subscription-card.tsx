'use client';

// Design pass (billing M3, Task 18; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). «Підписка» sits beside the plan and the limits (DESIGN-SYSTEM.md §0.12):
// - what is charged and when, in one line each: the plan and «499,00 ₴/міс», then «Наступне
//   списання 15 листопада» (mono figures) — or, cancelled, «Скасовано. Доступ до …», or in
//   grace the warning with the date LiqPay keeps trying until, on `--warning-soft`;
// - a scheduled change is its own quiet row with «Скасувати зміну»: a downgrade «З 15 листопада:
//   Pro, 500,00 ₴/міс», a switch «З 15 листопада — щорічно, 4 990,00 ₴» (B14); once the switch's
//   old subscription has stopped, the row says it waits for payment (the page's banner has the
//   «Підтвердити оплату» action) and cannot be withdrawn;
// - actions under it: «Змінити тариф» (to the plans below; disabled in grace with the reason)
//   and «Скасувати підписку» (ghost, through ConfirmDialog that says until when access stays);
//   cancelled, «Відновити підписку» opens the subscribe dialog with the consent again.
// A complimentary plan has no charge, so the card says who granted it and offers nothing to do.
import type { SubscriptionDto } from '@stepler/contracts';
import { Badge } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { ConfirmDialog } from '@stepler/ui/components/confirm-dialog';
import { Panel, PanelContent } from '@stepler/ui/components/panel';
import { useToast } from '@stepler/ui/components/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, RefreshCw } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { BILLING_KEY, cancelPendingChange, cancelSubscription } from '@/api/billing';
import { USAGE_KEY } from '@/api/collections';
import { monoDigits } from '@/format/mono-digits';
import { formatMoney, type PlanInterval, type PricedPlan } from './offers';
import { usePlanPrice } from './plan-picker';
import { SubscribeDialog } from './subscribe-dialog';

const KYIV = 'Europe/Kyiv';

/** The id of the plans section, for «Змінити тариф». */
export const PLANS_SECTION_ID = 'plans';

export function SubscriptionCard({
  subscription,
  resumePlan,
}: {
  subscription: SubscriptionDto;
  /** A cancelled or unpaid plan's offer at its price, when still sold («Відновити», «Оплатити зараз»). */
  resumePlan: PricedPlan | null;
}) {
  const t = useTranslations('billing.subscription');
  const format = useFormatter();
  const now = useNow();
  const planPrice = usePlanPrice();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [paying, setPaying] = useState(false);
  const reasonId = useId();
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: KYIV });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: BILLING_KEY });
    void queryClient.invalidateQueries({ queryKey: USAGE_KEY });
  };
  const withdraw = useMutation({
    mutationFn: cancelPendingChange,
    onSuccess: () => {
      refresh();
      toast({ variant: 'success', title: t('withdrawn') });
    },
    onError: () => toast({ variant: 'error', title: t('withdrawFailed') }),
  });

  const paid = subscription.source === 'LIQPAY';
  const interval: PlanInterval | null =
    subscription.interval === 'MONTH' || subscription.interval === 'YEAR'
      ? subscription.interval
      : null;
  const price =
    subscription.price === null || interval === null
      ? null
      : planPrice({ price: subscription.price, interval });
  const end = subscription.currentPeriodEnd;
  const status = subscription.status;
  const pending = subscription.pendingChange;
  const awaiting = pending?.awaitingPayment === true;
  const changeable = status === 'ACTIVE' && !awaiting;
  const graceOver =
    subscription.graceEndsAt !== null &&
    new Date(subscription.graceEndsAt).getTime() <= now.getTime();
  // In grace the missed renewal can be paid at once (a switch is confirmed by the page's banner).
  const payable = paid && status === 'PAST_DUE' && !awaiting && resumePlan !== null;

  let line: string;
  if (!paid) line = end === null ? t('grantedOpen') : t('grantedUntil', { date: date(end) });
  else if (status === 'CANCELED') line = t('canceled', { date: end === null ? '' : date(end) });
  else if (status === 'PAST_DUE' && graceOver) {
    // The job ends the plan within the hour (later if LiqPay is unreachable); paying still works.
    line = t('pastDueOver');
  } else if (status === 'PAST_DUE') {
    line = t(awaiting ? 'switchDue' : 'pastDue', {
      date: subscription.graceEndsAt === null ? '' : date(subscription.graceEndsAt),
    });
  } else if (awaiting) line = end === null ? '' : t('switchEnds', { date: date(end) });
  else line = end === null ? '' : t('next', { date: date(end) });

  const pendingInterval: PlanInterval = pending?.interval === 'YEAR' ? 'YEAR' : 'MONTH';
  const pendingDate = pending?.effectiveAt == null ? '' : date(pending.effectiveAt);
  let pendingText = '';
  if (pending !== null && pending.kind === 'DOWNGRADE') {
    pendingText = t('pending', {
      date: pendingDate,
      title: pending.offerTitle,
      price: planPrice({ price: pending.price, interval: pendingInterval }),
    });
  } else if (pending !== null) {
    pendingText = t(awaiting ? 'pendingAwaiting' : 'pendingSwitch', {
      date: pendingDate,
      interval: pending.interval,
      title: pending.offerTitle,
      amount: formatMoney(format.number, pending.price),
    });
  }
  const reasonKey = awaiting ? 'switchChange' : 'pastDueChange';

  return (
    <Panel data-slot="subscription-card" className="h-full">
      <PanelContent className="flex h-full flex-col gap-4">
        <div className="grid gap-1.5">
          <p className="text-sm text-muted-foreground">{t('title')}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="type-h2">{subscription.offerTitle}</h2>
            <Badge variant={badgeVariant(subscription)}>
              {t(`status.${badgeKey(subscription)}`)}
            </Badge>
          </div>
          {price === null ? null : (
            <p className="text-[0.9375rem] font-medium tabular-nums">{price}</p>
          )}
        </div>
        <p
          className={
            status === 'PAST_DUE'
              ? 'rounded-control bg-warning-soft p-3 text-sm text-pretty'
              : 'flex items-start gap-2 text-[0.9375rem] text-pretty text-foreground-soft'
          }
        >
          {status === 'PAST_DUE' ? null : (
            <CalendarClock
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
          )}
          <span>{monoDigits(line, 'font-mono text-[0.875rem] tabular-nums')}</span>
        </p>
        {pending === null ? null : (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-3 text-sm">
            <p className="flex items-start gap-2 text-pretty">
              <RefreshCw
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <span>{pendingText}</span>
            </p>
            {awaiting ? null : (
              <Button
                variant="ghost"
                aria-disabled={withdraw.isPending || undefined}
                onClick={() => {
                  if (!withdraw.isPending) withdraw.mutate();
                }}
              >
                {t('withdraw')}
              </Button>
            )}
          </div>
        )}
        {paid ? (
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            {status === 'CANCELED' ? (
              resumePlan === null ? null : (
                <Button className="max-sm:w-full" onClick={() => setResuming(true)}>
                  {t('resume')}
                </Button>
              )
            ) : (
              <>
                {payable ? (
                  <Button className="max-sm:w-full" onClick={() => setPaying(true)}>
                    {t('payNow')}
                  </Button>
                ) : null}
                <Button
                  asChild={changeable}
                  variant="outline"
                  className="max-sm:w-full"
                  disabled={!changeable}
                  aria-describedby={changeable ? undefined : reasonId}
                >
                  {changeable ? <a href={`#${PLANS_SECTION_ID}`}>{t('change')}</a> : t('change')}
                </Button>
                <Button
                  variant="ghost"
                  className="max-sm:w-full"
                  onClick={() => setConfirming(true)}
                >
                  {t('cancel')}
                </Button>
              </>
            )}
          </div>
        ) : null}
        {paid && !changeable && status !== 'CANCELED' ? (
          <p id={reasonId} className="text-sm text-muted-foreground">
            {t(reasonKey)}
          </p>
        ) : null}
      </PanelContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('cancelTitle')}
        description={t('cancelText', { date: end === null ? '' : date(end) })}
        confirmLabel={t('cancelConfirm')}
        cancelLabel={t('cancelKeep')}
        pendingLabel={t('cancelPending')}
        errorMessage={t('cancelFailed')}
        destructive
        onConfirm={async () => {
          await cancelSubscription();
          refresh();
          toast({ variant: 'success', title: t('canceledToast') });
        }}
      />
      {resumePlan === null || end === null ? null : (
        <SubscribeDialog
          plan={resumePlan}
          open={resuming}
          onOpenChange={setResuming}
          resumeFrom={end}
        />
      )}
      {resumePlan === null || !payable ? null : (
        <SubscribeDialog plan={resumePlan} open={paying} onOpenChange={setPaying} payNow />
      )}
    </Panel>
  );
}

type BadgeKey = 'active' | 'canceled' | 'pastDue' | 'granted';

function badgeKey(subscription: SubscriptionDto): BadgeKey {
  if (subscription.source === 'COMPLIMENTARY') return 'granted';
  if (subscription.status === 'CANCELED') return 'canceled';
  if (subscription.status === 'PAST_DUE') return 'pastDue';
  return 'active';
}

function badgeVariant(subscription: SubscriptionDto) {
  const key = badgeKey(subscription);
  return key === 'pastDue' ? 'warning' : key === 'canceled' ? 'neutral' : 'success';
}
