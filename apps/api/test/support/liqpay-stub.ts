import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { decodeData, liqpaySign } from '../../src/billing/liqpay/liqpay-signature.js';
import { TEST_LIQPAY } from './billing.js';

/** What the stub answers for an order: LiqPay's JSON, `'down'` (HTTP 500) or nothing known. */
export type StubAnswer = Record<string, unknown> | 'down';

/**
 * A local stand-in for LiqPay's server API (`/api/request`), reached through `LIQPAY_API_BASE`:
 * it checks our signature like LiqPay does and answers `status`, `unsubscribe`,
 * `subscribe_update`, `refund` and `reports` from what a test set. It replaces
 * only LiqPay's endpoint; the product's `LiqPayProvider` runs unchanged (rule 18).
 */
export class LiqPayStub {
  readonly answers = new Map<string, StubAnswer>();
  /**
   * The payments archive (`reports`): every row LiqPay would list for the asked dates (the
   * adapter keeps one order's), or `'down'`. Empty by default: LiqPay shows no charges.
   */
  reports: Record<string, unknown>[] | 'down' = [];
  readonly calls: { action: string; orderId: string; amount?: string }[] = [];
  private server: Server | undefined;
  base = '';

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
      req.on('end', () => {
        const form = new URLSearchParams(body);
        const data = form.get('data') ?? '';
        const params = decodeData(data) ?? {};
        const send = (status: number, json: unknown) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(json));
        };
        if (form.get('signature') !== liqpaySign(TEST_LIQPAY.privateKey, data)) {
          send(200, { result: 'error', status: 'error', err_code: 'err_signature' });
          return;
        }
        const orderId = String(params.order_id);
        const action = String(params.action);
        if (action === 'reports') {
          this.calls.push({ action, orderId: '' });
          if (this.reports === 'down') send(500, {});
          else send(200, { result: 'success', data: this.reports });
          return;
        }
        this.calls.push({
          action,
          orderId,
          ...(typeof params.amount === 'string' ? { amount: params.amount } : {}),
        });
        // `"<action>:<order>"` answers one action (e.g. `unsubscribe`); `"<order>"` all of them.
        const answer = this.answers.get(`${action}:${orderId}`) ?? this.answers.get(orderId);
        if (answer === 'down') send(500, {});
        else if (answer === undefined) {
          send(200, { result: 'error', status: 'error', err_code: 'payment_not_found' });
        } else send(200, { result: 'ok', order_id: orderId, ...answer });
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    this.base = `http://127.0.0.1:${(this.server?.address() as AddressInfo).port}`;
  }

  reset(): void {
    this.answers.clear();
    this.reports = [];
    this.calls.length = 0;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise((resolve) => this.server?.close(resolve));
  }
}
