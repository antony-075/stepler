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
 * «Тариф і оплата» (ADR 0018) in the full admin column like every admin page (owner remark,
 * billing M4 round): three tabs, «Огляд» (what the account has
 * now), «Тарифи» (the subscriptions and packs on sale) and «Історія оплат», in `?tab=`.
 * `?pack=` / `?plan=` / `?collection=` open «Тарифи» with that purchase dialog.
 */
export default function BillingPage() {
  return (
    <AdminPage>
      <Suspense>
        <BillingOverview />
      </Suspense>
    </AdminPage>
  );
}
