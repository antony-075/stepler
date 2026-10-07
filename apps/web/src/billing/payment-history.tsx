'use client';

// Design pass (billing M2, Task 14; web-design-guidelines, responsive-design). The account's
// payments, newest first: date (Kyiv, tabular figures; Cyrillic months stay in Golos), what was bought, the amount (tabular figures, right-aligned
// so the decimals line up) and the state as a badge in words (Оплачено / Не пройшла / Очікує /
// Повернено частково / Повернено). From `md` a table with real headers; on phones each payment is
// one row of two lines, so nothing scrolls sideways at 320px. Empty, loading and error states.
import type { PaymentStatus } from '@stepler/contracts';
import { Alert } from '@stepler/ui/components/alert';
import { Badge, type BadgeVariant } from '@stepler/ui/components/badge';
import { Button } from '@stepler/ui/components/button';
import { Panel, PanelContent, PanelHeader, PanelTitle } from '@stepler/ui/components/panel';
import { Skeleton } from '@stepler/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { listPayments, PAYMENTS_KEY } from '@/api/billing';
import { formatMoney } from './offers';

const KYIV = 'Europe/Kyiv';

export const PAYMENT_BADGE: Record<PaymentStatus, BadgeVariant> = {
  PENDING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  EXPIRED: 'neutral',
  REVERSED: 'warning',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'neutral',
};

export function PaymentHistory() {
  const t = useTranslations('billing.history');
  const tBilling = useTranslations('billing');
  const format = useFormatter();
  const payments = useQuery({ queryKey: PAYMENTS_KEY, queryFn: listPayments });
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeZone: KYIV });

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>{t('title')}</PanelTitle>
      </PanelHeader>
      <PanelContent>
        {payments.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : payments.isError ? (
          <Alert
            variant="error"
            action={
              <Button variant="outline" onClick={() => void payments.refetch()}>
                {tBilling('retry')}
              </Button>
            }
          >
            {t('loadFailed')}
          </Alert>
        ) : payments.data.items.length === 0 ? (
          <p className="text-muted-foreground">{t('empty')}</p>
        ) : (
          <table className="w-full text-left text-sm max-md:block">
            <thead className="max-md:sr-only">
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('date')}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t('what')}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  {t('amount')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t('status')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y max-md:block">
              {payments.data.items.map((payment) => (
                <tr
                  key={payment.id}
                  className="max-md:grid max-md:grid-cols-[1fr_auto] max-md:gap-x-4 max-md:gap-y-1 max-md:py-3"
                >
                  <td className="py-3 pr-4 whitespace-nowrap tabular-nums max-md:col-start-1 max-md:row-start-2 max-md:p-0 max-md:text-muted-foreground">
                    {date(payment.createdAt)}
                  </td>
                  <td className="py-3 pr-4 max-md:col-start-1 max-md:row-start-1 max-md:p-0 max-md:font-medium">
                    {payment.offerTitle}
                  </td>
                  <td className="py-3 pr-4 text-right whitespace-nowrap tabular-nums max-md:col-start-2 max-md:row-start-1 max-md:p-0">
                    {formatMoney(format.number, payment)}
                  </td>
                  <td className="py-3 max-md:col-start-2 max-md:row-start-2 max-md:p-0 max-md:text-right">
                    <Badge variant={PAYMENT_BADGE[payment.status]}>
                      {t(`statuses.${payment.status}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PanelContent>
    </Panel>
  );
}
