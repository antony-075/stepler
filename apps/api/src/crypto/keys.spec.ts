import { describe, expect, test } from 'vitest';
import { deriveKey, hashIp } from './keys.js';

const secret = Buffer.alloc(32, 7);

describe('deriveKey', () => {
  test('is deterministic, 32 bytes, and different per purpose', () => {
    expect(deriveKey(secret, 'ip-hash')).toEqual(deriveKey(secret, 'ip-hash'));
    expect(deriveKey(secret, 'ip-hash')).toHaveLength(32);
    expect(deriveKey(secret, 'ip-hash')).not.toEqual(deriveKey(secret, 'st_oauth'));
    expect(deriveKey(secret, 'ip-hash')).not.toEqual(secret);
  });

  test('hashIp does not reveal the IP and depends on the key', () => {
    const key = deriveKey(secret, 'ip-hash');
    expect(hashIp(key, '203.0.113.7')).not.toContain('203');
    expect(hashIp(key, '203.0.113.7')).not.toBe(
      hashIp(deriveKey(Buffer.alloc(32, 8), 'ip-hash'), '203.0.113.7'),
    );
  });
});
