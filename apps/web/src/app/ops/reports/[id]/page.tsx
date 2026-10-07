import { notFound } from 'next/navigation';
import { ReportDetail } from '@/ops/report-detail';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One report and every action on it (R5). */
export default async function OpsReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <ReportDetail id={id} />;
}
