import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AdminPage } from '@/components/admin-page';
import { PaymentReturn } from './payment-return';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('billing.return');
  return { title: t('pageTitle') };
}

/**
 * Where LiqPay sends the payer back (`result_url`, ADR 0018 [P7]). It shows only what our API
 * says about `?payment=`; any other parameter in the URL (e.g. `status=success`) is ignored.
 */
export default function PaymentReturnPage() {
  return (
    <AdminPage className="*:max-w-[640px]">
      <Suspense>
        <PaymentReturn />
      </Suspense>
    </AdminPage>
  );
}
