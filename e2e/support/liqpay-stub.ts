// A local stand-in for LiqPay's server API (`/api/request`) in the Playwright journeys (ADR 0018,
// plan Task 14). The API reaches it through `LIQPAY_API_BASE`; only LiqPay's endpoint is
// replaced, the product's `LiqPayProvider` runs unchanged (rule 18). It checks the request's
// signature like LiqPay does and answers `status` from what a journey set through
// `POST /__control/status`; `unsubscribe` and `subscribe_update` answer as the sandbox did in
// spike S1b (`unsubscribed`; `subscribed` with the new amount, nothing charged); `refund` answers
// `reversed` as the sandbox did on 2026-10-15; `reports` (the payments archive) lists nothing.
// Run by Playwright as a web server: `node support/liqpay-stub.ts`
// (Node strips the types), so it imports nothing but Node built-ins.
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const PORT = Number(process.env.E2E_LIQPAY_PORT ?? 4180);
const PRIVATE_KEY = process.env.LIQPAY_PRIVATE_KEY ?? '';
const answers = new Map<string, Record<string, unknown>>();

const sign = (data: string): string =>
  createHash('sha3-256')
    .update(PRIVATE_KEY + data + PRIVATE_KEY)
    .digest('base64');

function read(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    req.on('end', () => resolve(body));
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  void read(req).then((body) => {
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true });
    if (req.method === 'POST' && req.url === '/__control/status') {
      const { orderId, fields } = JSON.parse(body) as {
        orderId: string;
        fields: Record<string, unknown>;
      };
      answers.set(orderId, fields);
      return json(res, 200, {});
    }
    if (req.method === 'POST' && req.url === '/api/request') {
      const form = new URLSearchParams(body);
      const data = form.get('data') ?? '';
      if (form.get('signature') !== sign(data)) {
        return json(res, 200, { result: 'error', status: 'error', err_code: 'err_signature' });
      }
      const params = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as {
        action: string;
        order_id: string;
        amount?: number | string;
        currency?: string;
      };
      if (params.action === 'unsubscribe') {
        const fields = { action: 'unsubscribe', status: 'unsubscribed', version: 7 };
        answers.set(params.order_id, { ...answers.get(params.order_id), ...fields });
        return json(res, 200, { result: 'ok', order_id: params.order_id, ...fields });
      }
      if (params.action === 'refund') {
        // As the sandbox answered on 2026-10-15: `reversed` at once, full or partial.
        return json(res, 200, { result: 'ok', status: 'reversed', wait_amount: false });
      }
      if (params.action === 'reports') {
        // The payments archive (M4): no charges unless a journey's callbacks said otherwise.
        return json(res, 200, { result: 'success', data: [] });
      }
      if (params.action === 'subscribe_update') {
        const fields = {
          action: 'subscribe',
          status: 'subscribed',
          version: 7,
          amount: Number(params.amount),
          currency: params.currency,
        };
        return json(res, 200, { result: 'ok', order_id: params.order_id, ...fields });
      }
      const answer = answers.get(params.order_id);
      if (params.action !== 'status' || answer === undefined) {
        return json(res, 200, { result: 'error', status: 'error', err_code: 'payment_not_found' });
      }
      return json(res, 200, { result: 'ok', order_id: params.order_id, ...answer });
    }
    return json(res, 404, {});
  });
});

server.listen(PORT, '127.0.0.1');
