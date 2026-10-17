import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { AppError } from '../../errors/app-error.js';
import { decodeData, encodeData, liqpaySign } from './liqpay-signature.js';
import { LIQPAY_CHECKOUT_URL, LiqPayProvider } from './liqpay.provider.js';

const PUBLIC_KEY = 'sandbox_i00000001';
const PRIVATE_KEY = 'sandbox_unit-test-private-key';
const ORDER = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

/** A local stand-in for LiqPay's `/api/request`: records requests, answers what a test sets. */
let server: Server;
let base: string;
let handler: (params: Record<string, unknown>, res: ServerResponse) => void;
const received: { contentType: string | undefined; data: string; signature: string }[] = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    req.on('end', () => resolve(body));
  });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    void readBody(req).then((body) => {
      const form = new URLSearchParams(body);
      const entry = {
        contentType: req.headers['content-type'],
        data: form.get('data') ?? '',
        signature: form.get('signature') ?? '',
      };
      received.push(entry);
      handler(decodeData(entry.data) ?? {}, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  received.length = 0;
  handler = (_params, res) => json(res, 200, {});
});

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const provider = (timeoutMs?: number) =>
  new LiqPayProvider({
    publicKey: PUBLIC_KEY,
    privateKey: PRIVATE_KEY,
    apiBase: base,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

/** A callback body as LiqPay would post it, signed with the test key. */
function signed(fields: Record<string, unknown>, key = PRIVATE_KEY) {
  const data = encodeData(fields);
  return { data, signature: liqpaySign(key, data) };
}

const SUCCESS = {
  payment_id: 123456789,
  action: 'pay',
  status: 'success',
  version: 7,
  amount: 499,
  currency: 'UAH',
  order_id: ORDER,
  liqpay_order_id: 'JK1F2N3O1700000000000000',
  end_date: 1_791_000_000_000,
  create_date: 1_790_999_990_000,
  paytype: 'card',
  sender_first_name: 'Олена',
  sender_last_name: 'Коваль',
  sender_phone: '380000000000',
  ip: '203.0.113.7',
  sender_card_mask2: '424242*42',
  card_token: 'tok_secret',
};

describe('LiqPayProvider.checkoutForm', () => {
  const input = {
    orderId: ORDER,
    action: 'pay' as const,
    amountMinor: 734,
    currency: 'UAH' as const,
    description: 'Stepler: «Старт»',
    language: 'uk' as const,
    resultUrl: 'http://localhost:3000/app/billing/return?payment=' + ORDER,
    serverUrl: 'https://api.stepler.test/api/v1/billing/liqpay/callback',
    expiresAt: new Date('2026-10-07T12:30:00.000Z'),
  };

  test('signs version 7 pay data for the checkout page', () => {
    const form = provider().checkoutForm(input);
    expect(form.action).toBe(LIQPAY_CHECKOUT_URL);
    expect(form.fields.signature).toBe(liqpaySign(PRIVATE_KEY, form.fields.data));
    expect(decodeData(form.fields.data)).toEqual({
      public_key: PUBLIC_KEY,
      version: 7,
      action: 'pay',
      amount: '7.34',
      currency: 'UAH',
      description: 'Stepler: «Старт»',
      order_id: ORDER,
      language: 'uk',
      result_url: input.resultUrl,
      server_url: input.serverUrl,
      expired_date: '2026-10-07 12:30:00',
    });
  });

  test('subscribe adds the recurring fields; no server URL leaves server_url out', () => {
    const form = provider().checkoutForm({
      ...input,
      action: 'subscribe',
      serverUrl: null,
      subscription: { startAt: new Date('2026-10-07T12:00:00.000Z'), periodicity: 'month' },
    });
    const data = decodeData(form.fields.data);
    expect(data).toMatchObject({
      action: 'subscribe',
      subscribe: 1,
      subscribe_date_start: '2026-10-07 12:00:00',
      subscribe_periodicity: 'month',
    });
    expect(data).not.toHaveProperty('server_url');
  });

  test('never contains the private key', () => {
    const form = provider().checkoutForm(input);
    expect(Buffer.from(form.fields.data, 'base64').toString('utf8')).not.toContain(PRIVATE_KEY);
    expect(JSON.stringify(form)).not.toContain(PRIVATE_KEY);
  });
});

describe('LiqPayProvider.verifyCallback', () => {
  test('a signed success maps to our event with a safe payload only', () => {
    const event = provider().verifyCallback(signed(SUCCESS));
    expect(event).toMatchObject({
      orderId: ORDER,
      providerPaymentId: '123456789',
      providerOrderId: 'JK1F2N3O1700000000000000',
      action: 'pay',
      outcome: 'SUCCEEDED',
      rawStatus: 'success',
      amountMinor: 49900,
      currency: 'UAH',
      errCode: null,
      occurredAt: new Date(1_791_000_000_000),
    });
    for (const key of [
      'sender_first_name',
      'sender_last_name',
      'sender_phone',
      'ip',
      'sender_card_mask2',
      'card_token',
    ]) {
      expect(event.safePayload).not.toHaveProperty(key);
    }
    expect(JSON.stringify(event)).not.toContain('Олена');
  });

  test('an amount with more than two decimals is no amount (a mismatch downstream)', () => {
    expect(provider().verifyCallback(signed({ ...SUCCESS, amount: 0.1 + 0.2 })).amountMinor).toBe(
      null,
    );
  });

  const invalid = (body: { data: string; signature: string }) => {
    try {
      provider().verifyCallback(body);
    } catch (error) {
      return error instanceof AppError ? error.code : 'other';
    }
    return 'accepted';
  };

  test('tampered, foreign-key, SHA-1, empty and malformed bodies are refused', () => {
    const good = signed(SUCCESS);
    const tampered =
      good.data.slice(0, 10) + (good.data[10] === 'A' ? 'B' : 'A') + good.data.slice(11);
    expect(invalid({ data: tampered, signature: good.signature })).toBe(
      'BILLING_SIGNATURE_INVALID',
    );
    expect(invalid(signed(SUCCESS, 'another-key'))).toBe('BILLING_SIGNATURE_INVALID');
    const sha1 = createHash('sha1')
      .update(PRIVATE_KEY + good.data + PRIVATE_KEY)
      .digest('base64');
    expect(invalid({ data: good.data, signature: sha1 })).toBe('BILLING_SIGNATURE_INVALID');
    expect(invalid({ data: good.data, signature: '' })).toBe('BILLING_SIGNATURE_INVALID');
    const notBase64 = 'not base64!';
    expect(invalid({ data: notBase64, signature: liqpaySign(PRIVATE_KEY, notBase64) })).toBe(
      'BILLING_SIGNATURE_INVALID',
    );
    const array = Buffer.from('[1]').toString('base64');
    expect(invalid({ data: array, signature: liqpaySign(PRIVATE_KEY, array) })).toBe(
      'BILLING_SIGNATURE_INVALID',
    );
    expect(invalid(signed({ ...SUCCESS, order_id: undefined }))).toBe('BILLING_SIGNATURE_INVALID');
  });
});

describe('LiqPayProvider server calls', () => {
  test('status posts a signed form and maps the answer', async () => {
    handler = (params, res) => json(res, 200, { ...SUCCESS, order_id: params.order_id });
    const event = await provider().status(ORDER);
    expect(event).toMatchObject({ orderId: ORDER, outcome: 'SUCCEEDED', amountMinor: 49900 });
    const [call] = received;
    expect(call?.contentType).toBe('application/x-www-form-urlencoded');
    expect(call?.signature).toBe(liqpaySign(PRIVATE_KEY, call?.data ?? ''));
    expect(decodeData(call?.data ?? '')).toEqual({
      public_key: PUBLIC_KEY,
      version: 7,
      action: 'status',
      order_id: ORDER,
    });
  });

  test('an unknown order is null; another error without an order is unavailable', async () => {
    handler = (_params, res) =>
      json(res, 200, { result: 'error', status: 'error', err_code: 'payment_not_found' });
    expect(await provider().status(ORDER)).toBeNull();
    handler = (_params, res) =>
      json(res, 200, { result: 'error', status: 'error', err_code: 'err_signature' });
    await expect(provider().status(ORDER)).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
    });
  });

  test('a 500, a non-JSON answer and a timeout are PAYMENT_PROVIDER_UNAVAILABLE', async () => {
    handler = (_params, res) => json(res, 500, {});
    await expect(provider().status(ORDER)).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      status: 503,
    });
    handler = (_params, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>');
    };
    await expect(provider().refund(ORDER, 100)).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
    });
    handler = () => undefined; // never answers
    await expect(provider(50).status(ORDER)).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
    });
  });

  test('refund sends the decimal amount and maps the answer', async () => {
    handler = (_params, res) => json(res, 200, { result: 'ok', status: 'reversed' });
    expect(await provider().refund(ORDER, 30000)).toEqual({
      outcome: 'SUCCEEDED',
      rawStatus: 'reversed',
    });
    expect(decodeData(received[0]?.data ?? '')).toMatchObject({
      action: 'refund',
      amount: '300.00',
    });
  });

  test('charges reads the payments archive: one order only, oldest first, no card data', async () => {
    const regular = (paymentId: number, status: string, endDate: number) => ({
      ...SUCCESS,
      action: 'regular',
      status,
      payment_id: paymentId,
      end_date: endDate,
    });
    handler = (_params, res) =>
      json(res, 200, {
        result: 'success',
        data: [
          regular(3, 'success', 1_791_000_300_000),
          regular(2, 'failure', 1_791_000_200_000),
          { ...regular(4, 'success', 1_791_000_100_000), order_id: 'someone-else' },
        ],
      });
    const from = new Date(1_790_900_000_000);
    const to = new Date(1_791_100_000_000);
    const events = await provider().charges(ORDER, from, to);
    expect(events.map((ev) => [ev.providerPaymentId, ev.outcome, ev.action])).toEqual([
      ['2', 'FAILED', 'regular'],
      ['3', 'SUCCEEDED', 'regular'],
    ]);
    expect(JSON.stringify(events)).not.toMatch(/Олена|424242|tok_secret|203\.0\.113/);
    expect(decodeData(received[0]?.data ?? '')).toEqual({
      public_key: PUBLIC_KEY,
      version: 7,
      action: 'reports',
      date_from: String(from.getTime()),
      date_to: String(to.getTime()),
    });
  });

  test('an archive error is PAYMENT_PROVIDER_UNAVAILABLE, never "no charges"', async () => {
    handler = (_params, res) => json(res, 200, { result: 'error', err_code: 'err_access' });
    await expect(provider().charges(ORDER, new Date(0), new Date())).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
    });
  });
});
