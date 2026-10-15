import { PaymentDetail } from '@/ops/billing/payment-detail';

/** One payment: its money, LiqPay's messages, refunds (plan Task 21). */
export default async function OpsPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaymentDetail id={id} />;
}
