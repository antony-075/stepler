'use client';

// Design pass (billing M3, owner decision B14; frontend-design, web-design-guidelines). A
// monthly ↔ yearly switch whose old LiqPay subscription has stopped waits for the owner to pay
// the new one: the most important fact on «Тариф і оплата», so it is the page's first block,
// the warning Alert with the one action «Підтвердити оплату» (the subscribe dialog with the
// auto-renewal consent; the new period starts at the old period's end, or now if that passed).
// The sentence says until when everything keeps working (the grace end, else the period end).
import type { OfferList, SubscriptionDto } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Button } from '@stepler/ui/components/button';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatMoney, type PricedPlan } from './offers';
import { SubscribeDialog } from './subscribe-dialog';

const KYIV = 'Europe/Kyiv';

export function SwitchConfirmBanner({
  subscription,
  offers,
}: {
  subscription: SubscriptionDto;
  offers: OfferList | undefined;
}) {
  const t = useTranslations('billing.switch');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const pending = subscription.pendingChange;
  if (pending === null || !pending.awaitingPayment) return null;
  const plan = pendingPlan(offers, pending.offerId, pending.priceId);
  const until = subscription.graceEndsAt ?? subscription.currentPeriodEnd;
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'long', timeZone: KYIV });

  return (
    <>
      <Alert
        variant="warning"
        role="status"
        title={t('title', {
          title: pending.offerTitle,
          interval: pending.interval,
          amount: formatMoney(format.number, pending.price),
        })}
        action={
          plan === null ? undefined : <Button onClick={() => setOpen(true)}>{t('confirm')}</Button>
        }
      >
        {until === null ? t('textOpen') : t('text', { date: date(until) })}
      </Alert>
      {plan === null || subscription.currentPeriodEnd === null ? null : (
        <SubscribeDialog
          plan={plan}
          open={open}
          onOpenChange={setOpen}
          switchFrom={subscription.currentPeriodEnd}
        />
      )}
    </>
  );
}

/** The pending price as a plan on sale; `null` when it is no longer sold. */
function pendingPlan(
  offers: OfferList | undefined,
  offerId: string,
  priceId: string,
): PricedPlan | null {
  const offer = offers?.items.find((item) => item.id === offerId);
  const price = offer?.prices.find((item) => item.id === priceId);
  if (offer === undefined || price === undefined) return null;
  if (price.interval !== 'MONTH' && price.interval !== 'YEAR') return null;
  return {
    offer,
    priceId: price.id,
    price: { amountMinor: price.amountMinor, currency: price.currency },
    interval: price.interval,
  };
}
