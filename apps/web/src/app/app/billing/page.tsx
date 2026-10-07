import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminPage } from '@/components/admin-page';
import { BillingOverview } from './billing-overview';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('billing');
  return { title: t('pageTitle') };
}

/**
 * «Тариф і оплата» (ADR 0018). In M1 it says what the account has now (trial, grant or nothing)
 * and that card payments come next; no buttons that cannot work yet (rule 18).
 */
export default function BillingPage() {
  return (
    <AdminPage className="*:max-w-[1240px]">
      <BillingOverview />
    </AdminPage>
  );
}
