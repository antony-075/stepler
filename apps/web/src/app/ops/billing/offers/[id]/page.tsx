import { OfferEditor } from '@/ops/billing/offer-editor';

/** One offer's editor; `new` creates one (plan Task 20). */
export default async function OpsOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OfferEditor id={id} />;
}
