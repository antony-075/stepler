'use client';

// The billing section's pages (ADR 0018) in the console's one tab row (`OpsTabs`, owner remark
// 2026-10-16: the tabs are the same everywhere): payments, subscriptions, plans and prices,
// free plans. A detail page keeps its list's tab current.
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { OpsTabs } from '../ops-page';

const SECTIONS = [
  { key: 'payments', href: '/ops/billing/payments' },
  { key: 'subscriptions', href: '/ops/billing/subscriptions' },
  { key: 'offers', href: '/ops/billing/offers' },
  { key: 'grants', href: '/ops/billing/grants' },
] as const;

export function BillingNav() {
  const t = useTranslations('ops.billingNav');
  const pathname = usePathname();
  return (
    <div className="mb-6">
      <OpsTabs
        label={t('label')}
        tabs={SECTIONS.map((section) => ({
          key: section.key,
          href: section.href,
          label: t(section.key),
          current: pathname.startsWith(section.href),
        }))}
      />
    </div>
  );
}
