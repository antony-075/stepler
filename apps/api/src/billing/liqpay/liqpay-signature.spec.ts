import { describe, expect, test } from 'vitest';
import { decodeData, encodeData, liqpaySign, signatureMatches } from './liqpay-signature.js';

// The worked example of LiqPay's checkout documentation (version 7, read 2026-10-07).
const DOC_PRIVATE_KEY = 'a4825234f4bae72a0be04eafe9e8e2bada209255';
const DOC_PARAMS = {
  public_key: 'i00000000',
  version: 7,
  action: 'pay',
  amount: '3',
  currency: 'UAH',
  description: 'test',
  order_id: '000001',
};
const DOC_DATA =
  'eyJwdWJsaWNfa2V5IjoiaTAwMDAwMDAwIiwidmVyc2lvbiI6NywiYWN0aW9uIjoicGF5IiwiYW1vdW50IjoiMyIsImN1cnJlbmN5IjoiVUFIIiwiZGVzY3JpcHRpb24iOiJ0ZXN0Iiwib3JkZXJfaWQiOiIwMDAwMDEifQ==';

describe('LiqPay signature', () => {
  test('reproduces the documentation’s worked example (SHA3-256)', () => {
    expect(encodeData(DOC_PARAMS)).toBe(DOC_DATA);
    expect(liqpaySign(DOC_PRIVATE_KEY, DOC_DATA)).toBe(
      '0adgJ8F2Ds5HCVkcz4AlmdLMRoIJf7IxsL3QmeFRz/s=',
    );
  });

  test('accepts only the exact signature', () => {
    const good = liqpaySign(DOC_PRIVATE_KEY, DOC_DATA);
    expect(signatureMatches(DOC_PRIVATE_KEY, DOC_DATA, good)).toBe(true);
    expect(signatureMatches(DOC_PRIVATE_KEY, `${DOC_DATA.slice(0, -3)}x==`, good)).toBe(false);
    expect(signatureMatches(DOC_PRIVATE_KEY, DOC_DATA, '')).toBe(false);
    // The SHA-1 the SDKs use for version 3 does not pass.
    expect(signatureMatches(DOC_PRIVATE_KEY, DOC_DATA, 'CZQ2WPZ4+rJnKdg5BT9lSsJtXZk=')).toBe(false);
    expect(signatureMatches('another-key', DOC_DATA, good)).toBe(false);
  });

  test('decodes only base64 JSON objects', () => {
    expect(decodeData(DOC_DATA)).toEqual(DOC_PARAMS);
    expect(decodeData('not base64!')).toBeNull();
    expect(decodeData(Buffer.from('[1,2]').toString('base64'))).toBeNull();
    expect(decodeData(Buffer.from('"text"').toString('base64'))).toBeNull();
    expect(decodeData(Buffer.from('{oops').toString('base64'))).toBeNull();
  });
});
