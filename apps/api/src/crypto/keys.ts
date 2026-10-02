import { createHmac, hkdfSync } from 'node:crypto';

/**
 * Purpose-bound keys derived from APP_SECRET (HKDF-SHA256). Each purpose gets its own `info`,
 * so no key is ever reused for two jobs.
 */
export type KeyPurpose = 'ip-hash' | 'st_oauth' | 'guest-link-token';

export function deriveKey(appSecret: Buffer, purpose: KeyPurpose): Buffer {
  return Buffer.from(hkdfSync('sha256', appSecret, Buffer.alloc(0), purpose, 32));
}

/** HMAC-SHA256 of a client IP for abuse investigation; the IP itself is never stored. */
export function hashIp(key: Buffer, ip: string): string {
  return createHmac('sha256', key).update(ip).digest('base64url');
}
