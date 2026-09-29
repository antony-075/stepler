import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, base64url: 43 characters. Used for session and magic-link tokens. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Only this hash is stored; the raw token lives in the cookie or email only. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
