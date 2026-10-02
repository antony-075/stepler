import { describe, expect, test } from 'vitest';
import { hashToken } from '../auth/tokens.js';
import { GuestLinkTokens } from './guest-link-tokens.js';

const tokens = new GuestLinkTokens({
  APP_SECRET: Buffer.alloc(32, 7),
  APP_ORIGIN: 'https://x.test',
});

function flipByte(base64url: string, index: number): string {
  const bytes = Buffer.from(base64url, 'base64url');
  bytes[index] = (bytes[index] ?? 0) ^ 0x01;
  return bytes.toString('base64url');
}

describe('GuestLinkTokens', () => {
  test('generate and reveal round-trip a 43-character token', () => {
    const issued = tokens.generate();
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.tokenHash).toBe(hashToken(issued.token));
    expect(issued.tokenKeyId).toBe('app-secret-v1');
    expect(issued.tokenCiphertext).not.toContain(issued.token);
    expect(tokens.reveal(issued)).toBe(issued.token);
  });

  test('two tokens differ in value and IV', () => {
    const a = tokens.generate();
    const b = tokens.generate();
    expect(a.token).not.toBe(b.token);
    const iv = (c: string) => Buffer.from(c, 'base64url').subarray(0, 12).toString('hex');
    expect(iv(a.tokenCiphertext)).not.toBe(iv(b.tokenCiphertext));
  });

  test('a tampered ciphertext fails without revealing the token', () => {
    const issued = tokens.generate();
    for (const index of [0, 20, Buffer.from(issued.tokenCiphertext, 'base64url').length - 1]) {
      const row = { ...issued, tokenCiphertext: flipByte(issued.tokenCiphertext, index) };
      expect(() => tokens.reveal(row)).toThrow('guest link token cannot be decrypted');
      try {
        tokens.reveal(row);
      } catch (error) {
        expect(String((error as Error).message)).not.toContain(issued.token);
        expect(JSON.stringify(error)).not.toContain(issued.token);
      }
    }
  });

  test('a ciphertext copied from another row does not reveal', () => {
    const a = tokens.generate();
    const b = tokens.generate();
    expect(() => tokens.reveal({ ...a, tokenCiphertext: b.tokenCiphertext })).toThrow(
      'guest link token cannot be decrypted',
    );
  });

  test('an unknown key id fails; a revoked row reveals nothing', () => {
    const issued = tokens.generate();
    expect(() => tokens.reveal({ ...issued, tokenKeyId: 'other' })).toThrow(
      'guest link token cannot be decrypted',
    );
    expect(
      tokens.reveal({ tokenHash: issued.tokenHash, tokenCiphertext: null, tokenKeyId: null }),
    ).toBeNull();
  });

  test('another APP_SECRET cannot decrypt', () => {
    const issued = tokens.generate();
    const other = new GuestLinkTokens({
      APP_SECRET: Buffer.alloc(32, 8),
      APP_ORIGIN: 'https://x.test',
    });
    expect(() => other.reveal(issued)).toThrow('guest link token cannot be decrypted');
  });

  test('hashForLookup accepts only the token format', () => {
    const issued = tokens.generate();
    expect(tokens.hashForLookup('short')).toBeNull();
    expect(tokens.hashForLookup(`${issued.token}=`)).toBeNull();
    expect(tokens.hashForLookup(issued.token)).toBe(issued.tokenHash);
  });

  test('urlFor builds the guest URL from APP_ORIGIN', () => {
    const { token } = tokens.generate();
    expect(tokens.urlFor(token)).toBe(`https://x.test/g/${token}`);
  });
});
