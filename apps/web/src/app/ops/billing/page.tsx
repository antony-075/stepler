import { redirect } from 'next/navigation';

/** The billing section opens on its payments. */
export default function OpsBillingPage() {
  redirect('/ops/billing/payments');
}
