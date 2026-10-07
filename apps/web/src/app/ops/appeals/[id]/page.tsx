import { notFound } from 'next/navigation';
import { AppealDetail } from '@/ops/appeal-detail';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One admin appeal and the two decisions on it (slice 9b). */
export default async function OpsAppealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <AppealDetail id={id} />;
}
