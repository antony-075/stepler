'use client';

// Design pass (billing M3, Task 18; frontend-design, ui-ux-pro-max, web-design-guidelines,
// responsive-design). Subscribing is a paying action with a recurring charge, so the dialog is
// its own confirmation and says three things before the button: what the plan is and how often
// it is charged, what is paid now, and the auto-renewal consent sentence with the amount (B5).
// The pay button is disabled until the consent is ticked and says why; the API refuses a
// checkout without it anyway. Errors stay inside the dialog; on phones the footer stacks.
// The same dialog resumes a cancelled plan and confirms a monthly ↔ yearly switch at the period
// end (B14): then one more line says when the new period starts. In grace it is «Оплатити
// зараз» (`payNow`): one line says LiqPay stops retrying the old charge and the period starts now.
import { currentLegalVersion } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@stepler/ui/components/dialog';
import { Spinner } from '@stepler/ui/components/spinner';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { AutoRenewConsent } from './auto-renew-consent';
import { useCheckout } from './checkout-redirect';
import { formatMoney, type PricedPlan } from './offers';
import { usePlanPrice } from './plan-picker';

const KYIV = 'Europe/Kyiv';

export function SubscribeDialog({
  plan,
  open,
  onOpenChange,
  resumeFrom = null,
  switchFrom = null,
  payNow = false,
}: {
  plan: PricedPlan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resuming a cancelled plan: when its paid period ends (the new one starts then). */
  resumeFrom?: string | null;
  /** Confirming a switch (B14): the old plan's period end (the new one starts then, or now). */
  switchFrom?: string | null;
  /** In grace: pays the missed renewal through a new checkout (`POST /subscription/resume`). */
  payNow?: boolean;
}) {
  const t = useTranslations('billing.subscribe');
  const format = useFormatter();
  const now = useNow();
  const planPrice = usePlanPrice();
  const checkout = useCheckout();
  const [consent, setConsent] = useState(false);
  const consentId = useId();
  const hintId = useId();
  const termsVersion = currentLegalVersion('TERMS').version;
  const longDate = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: KYIV });
  const title = payNow
    ? t('payNowTitle', { title: plan.offer.title })
    : resumeFrom !== null
      ? t('resumeTitle', { title: plan.offer.title })
      : switchFrom !== null
        ? t('switchTitle', { title: plan.offer.title })
        : t('title', { title: plan.offer.title });
  const startsLater = switchFrom !== null && new Date(switchFrom).getTime() > now.getTime();

  const pay = () => {
    if (!consent || checkout.pending) return;
    void checkout
      .start(
        resumeFrom === null && !payNow
          ? { kind: 'SUBSCRIPTION', priceId: plan.priceId, autoRenewConsent: true, termsVersion }
          : { resumeSubscription: { termsVersion } },
      )
      .catch(() => undefined);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (checkout.pending) return;
          if (!next) {
            setConsent(false);
            checkout.reset();
          }
          onOpenChange(next);
        }}
      >
        <DialogContent closeLabel={t('cancel')}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t('description', { price: planPrice(plan) })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5">
            {resumeFrom === null ? null : (
              <p className="text-pretty text-foreground-soft">
                {t('continues', { date: longDate(resumeFrom) })}
              </p>
            )}
            {payNow ? <p className="text-pretty text-foreground-soft">{t('payNowNote')}</p> : null}
            {switchFrom === null ? null : (
              <p className="text-pretty text-foreground-soft">
                {startsLater ? t('switchStarts', { date: longDate(switchFrom) }) : t('switchNow')}
              </p>
            )}
            <p className="flex items-baseline justify-between gap-4 border-t pt-4">
              <span className="text-foreground-soft">{t('total')}</span>
              <span className="text-xl font-semibold tabular-nums">
                {formatMoney(format.number, plan.price)}
              </span>
            </p>
            <AutoRenewConsent
              id={consentId}
              price={plan.price}
              interval={plan.interval}
              checked={consent}
              onCheckedChange={setConsent}
              describedBy={consent ? undefined : hintId}
            />
            <p className="text-sm text-pretty text-muted-foreground">{t('liqpayNote')}</p>
            {checkout.errorMessage === null ? null : (
              <Alert variant="error">{checkout.errorMessage}</Alert>
            )}
          </div>
          <DialogFooter className="items-center">
            {consent ? null : (
              <p id={hintId} className="text-sm text-muted-foreground sm:mr-auto">
                {t('consentRequired')}
              </p>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={checkout.pending}>
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={!consent}
              aria-describedby={consent ? undefined : hintId}
              aria-disabled={checkout.pending || undefined}
              onClick={pay}
            >
              {checkout.pending ? <Spinner label={t('paying')} /> : null}
              {t('pay')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {checkout.handoff}
    </>
  );
}
