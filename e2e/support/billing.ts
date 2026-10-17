import { createHash } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { E2E_LIQPAY, LIQPAY_CHECKOUT_URL } from './billing-env.js';

export { E2E_LIQPAY, E2E_PRICES, LIQPAY_CHECKOUT_URL } from './billing-env.js';

const sign = (data: string): string =>
  createHash('sha3-256')
    .update(E2E_LIQPAY.privateKey + data + E2E_LIQPAY.privateKey)
    .digest('base64');

interface CheckoutData {
  action: string;
  order_id: string;
  amount: string;
  currency: string;
  result_url: string;
  server_url?: string;
}

/**
 * What LiqPay would do after the payer acts on its page. `success` / `failure`: LiqPay posts a
 * signed callback to `server_url` and sends the payer back to `result_url`. `processing`: no
 * callback yet, and the stub's `status` answers `processing`. `declined`: what the sandbox does
 * for a card its anti-fraud refuses — no callback, the order stays open for another attempt and
 * `status` does not know a payment for it.
 */
export type StubOutcome = 'success' | 'failure' | 'processing' | 'declined';

/**
 * Answers the next checkout form post in place of LiqPay's page. Returns the order id. The
 * outcome reaches our API through the same doors as LiqPay's: the signed callback and the
 * `status` API (via the local stub server).
 */
export async function payAtLiqPayStub(page: Page, outcome: StubOutcome): Promise<() => string> {
  let orderId = '';
  await page.route(LIQPAY_CHECKOUT_URL, async (route) => {
    const form = new URLSearchParams(route.request().postData() ?? '');
    const data = form.get('data') ?? '';
    expect(form.get('signature')).toBe(sign(data));
    const checkout = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as CheckoutData;
    orderId = checkout.order_id;
    // A subscription's first charge is reported as `subscribed` (spike S1b).
    const subscribe = checkout.action === 'subscribe';
    const fields = {
      action: subscribe ? 'subscribe' : 'pay',
      status: subscribe && outcome === 'success' ? 'subscribed' : outcome,
      version: 7,
      order_id: checkout.order_id,
      payment_id: Math.floor(Math.random() * 1e9),
      amount: Number(checkout.amount),
      currency: checkout.currency,
      end_date: Date.now(),
      ...(outcome === 'failure' ? { err_code: 'limit' } : {}),
    };
    if (outcome !== 'declined') {
      await fetch(`http://127.0.0.1:${E2E_LIQPAY.port}/__control/status`, {
        method: 'POST',
        body: JSON.stringify({ orderId: checkout.order_id, fields }),
      });
    }
    if ((outcome === 'success' || outcome === 'failure') && checkout.server_url !== undefined) {
      const callback = Buffer.from(JSON.stringify(fields), 'utf8').toString('base64');
      const res = await fetch(checkout.server_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: callback, signature: sign(callback) }).toString(),
      });
      expect(res.status).toBe(200);
    }
    await route.fulfill({ status: 302, headers: { Location: checkout.result_url } });
  });
  return () => orderId;
}

let regularSeq = 0;

/**
 * A renewal LiqPay charged (or failed to charge) on its own schedule: the signed `regular`
 * callback for the subscription's order (ADR 0018), posted to our public callback route.
 */
export async function postRenewalCallback(
  page: Page,
  orderId: string,
  status: 'success' | 'failure',
  amountMinor: number,
): Promise<void> {
  regularSeq += 1;
  const fields = {
    action: 'regular',
    status,
    version: 7,
    order_id: orderId,
    liqpay_order_id: `E2E-REGULAR-${Date.now()}-${regularSeq}`,
    payment_id: 8_000_000_000 + Math.floor(Math.random() * 1e8),
    amount: amountMinor / 100,
    currency: 'UAH',
    end_date: Date.now(),
    ...(status === 'failure' ? { err_code: 'limit' } : {}),
  };
  const data = Buffer.from(JSON.stringify(fields), 'utf8').toString('base64');
  const res = await page.request.post('/api/v1/billing/liqpay/callback', {
    form: { data, signature: sign(data) },
  });
  expect(res.status()).toBe(200);
}
