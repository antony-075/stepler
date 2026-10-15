import { paymentFiltersOf } from '@/ops/billing/billing-filters';
import { PaymentsConsole } from '@/ops/billing/payments-console';

/** Every payment (ADR 0018, plan Task 21); the filters live in the URL. */
export default async function OpsPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PaymentsConsole filters={paymentFiltersOf(await searchParams)} />;
}
