import { redirect } from 'next/navigation';

/** The billing section opens on its one screen in M1: complimentary plans. */
export default function OpsBillingPage() {
  redirect('/ops/billing/grants');
}
