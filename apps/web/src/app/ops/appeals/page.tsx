import { appealStatusFromParam } from '@/ops/appeal-labels';
import { AppealQueue } from '@/ops/appeal-queue';

/** The admins' appeals (slice 9b): `?status=open|upheld|rejected` (default «Нові»). */
export default async function OpsAppealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { status } = await searchParams;
  return <AppealQueue status={appealStatusFromParam(typeof status === 'string' ? status : null)} />;
}
