import { ReportQueue } from '@/ops/report-queue';
import { statusFromParam } from '@/ops/report-labels';

/** The report queue: `?status=open|actioned|dismissed` (default «Нові»). */
export default async function OpsReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { status } = await searchParams;
  return <ReportQueue status={statusFromParam(typeof status === 'string' ? status : null)} />;
}
