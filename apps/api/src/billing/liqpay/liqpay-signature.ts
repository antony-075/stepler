import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * LiqPay's request and callback signature for API version 7 (ADR 0018, verified against the
 * documentation's worked example): `base64(sha3-256(private_key + data + private_key))`. The
 * SDKs' SHA-1 belongs to version 3 and is never accepted.
 */
export function liqpaySign(privateKey: string, data: string): string {
  return createHash('sha3-256')
    .update(privateKey + data + privateKey)
    .digest('base64');
}

/** `base64(JSON.stringify(params))`: the `data` field of every request. */
export function encodeData(params: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(params), 'utf8').toString('base64');
}

/** Constant-time comparison of equal-length strings; any other length is a mismatch. */
export function signatureMatches(privateKey: string, data: string, signature: string): boolean {
  const expected = Buffer.from(liqpaySign(privateKey, data), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** The JSON object inside `data`, or `null` for anything else. */
export function decodeData(data: string): Record<string, unknown> | null {
  if (!BASE64.test(data)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
