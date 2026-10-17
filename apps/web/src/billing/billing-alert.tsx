'use client';

// Design pass (billing page v3; web-design-guidelines). The one alert at the top of «Огляд»: what
// needs the owner now, said once (the plan card keeps a short line, never the same sentence).
// In order: a monthly ↔ yearly switch waiting for its payment (`SwitchConfirmBanner`, with
// «Підтвердити оплату»), a missed renewal in grace or after it (pay with «Оплатити зараз» on the
// card), or a read-only account. Nothing otherwise.
import type { BillingSummary, OfferList } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { accountBanner } from '@/app/app/access-model';
import { SwitchConfirmBanner } from './switch-confirm-banner';

const KYIV = 'Europe/Kyiv';

export function BillingAlert({
  summary,
  offers,
}: {
  summary: BillingSummary;
  offers: OfferList | undefined;
}) {
  const t = useTranslations('billing');
  const format = useFormatter();
  const now = useNow({ updateInterval: 3600_000 });
  const subscription = summary.subscription;
  if (subscription?.pendingChange?.awaitingPayment === true) {
    return <SwitchConfirmBanner subscription={subscription} offers={offers} />;
  }
  if (subscription?.source === 'LIQPAY' && subscription.status === 'PAST_DUE') {
    const grace = subscription.graceEndsAt;
    const over = grace !== null && new Date(grace).getTime() <= now.getTime();
    const date =
      grace === null ? '' : format.dateTime(new Date(grace), { dateStyle: 'long', timeZone: KYIV });
    return (
      <Alert variant="warning" role="status">
        {over ? t('subscription.pastDueOver') : t('subscription.pastDue', { date })}
      </Alert>
    );
  }
  const banner = accountBanner(summary.access, now);
  if (banner?.kind !== 'readOnly') return null;
  return (
    <Alert variant="warning" role="status">
      {t(`access.readOnlyTitle.${banner.reason}`)}
    </Alert>
  );
}
