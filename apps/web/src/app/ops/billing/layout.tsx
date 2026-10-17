import type { ReactNode } from 'react';
import { BillingNav } from '@/ops/billing/billing-nav';

/** The billing section (ADR 0018): payments, subscriptions, plans and prices, free plans. */
export default function OpsBillingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <BillingNav />
      {children}
    </>
  );
}
