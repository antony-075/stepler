import { GrantsConsole } from '@/ops/billing/grants-console';

/** Complimentary plans (ADR 0018 [P13]): `?email=` opens that account. */
export default async function OpsGrantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { email } = await searchParams;
  const value = typeof email === 'string' && email.trim() !== '' ? email.trim() : null;
  return <GrantsConsole key={value ?? ''} email={value} />;
}
