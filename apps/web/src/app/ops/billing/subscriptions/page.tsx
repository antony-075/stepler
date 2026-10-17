import { subscriptionFiltersOf } from '@/ops/billing/billing-filters';
import { SubscriptionsConsole } from '@/ops/billing/subscriptions-console';

/** Every plan, paid or free (ADR 0018, plan Task 21); the filters live in the URL. */
export default async function OpsSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <SubscriptionsConsole filters={subscriptionFiltersOf(await searchParams)} />;
}
