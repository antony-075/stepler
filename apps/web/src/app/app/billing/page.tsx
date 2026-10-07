import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { AdminPage } from '@/components/admin-page';
import { BillingOverview } from './billing-overview';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('billing');
  return { title: t('pageTitle') };
}

/**
 * «Тариф і оплата» (ADR 0018): what the account has now, the packs on sale (M2) and the
 * payment history. `?pack=` / `?collection=` open the purchase dialog with that choice.
 */
export default function BillingPage() {
  return (
    <AdminPage className="*:max-w-[1240px]">
      <Suspense>
        <BillingOverview />
      </Suspense>
    </AdminPage>
  );
}
