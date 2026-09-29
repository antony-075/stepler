import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import type { ApiEnv } from '../../config/env.js';
import { serializeCookie } from '../session-cookie.js';

export const OAUTH_COOKIE = 'st_oauth';
const OAUTH_COOKIE_PATH = '/api/v1/auth/google';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 600;

const transactionSchema = z.object({
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  returnTo: z.string(),
});
export type OAuthTransaction = z.infer<typeof transactionSchema>;

function sign(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** `payload.signature`: the transaction is readable by the browser but not forgeable. */
export function encodeTransaction(key: Buffer, transaction: OAuthTransaction): string {
  const payload = Buffer.from(JSON.stringify(transaction)).toString('base64url');
  return `${payload}.${sign(key, payload)}`;
}

/** The transaction, if the cookie is authentic and its state matches the callback's. */
export function decodeTransaction(
  key: Buffer,
  cookie: string | undefined,
  state: string,
): OAuthTransaction | null {
  if (cookie === undefined) return null;
  const [payload, signature, extra] = cookie.split('.');
  if (payload === undefined || signature === undefined || extra !== undefined) return null;
  if (!safeEqual(signature, sign(key, payload))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const transaction = transactionSchema.safeParse(parsed);
  if (!transaction.success || !safeEqual(transaction.data.state, state)) return null;
  return transaction.data;
}

export function setOAuthCookie(res: ServerResponse, value: string, env: ApiEnv): void {
  res.appendHeader(
    'Set-Cookie',
    serializeCookie(OAUTH_COOKIE, value, {
      path: OAUTH_COOKIE_PATH,
      maxAgeSeconds: OAUTH_COOKIE_MAX_AGE_SECONDS,
      secure: env.COOKIE_SECURE,
    }),
  );
}

export function clearOAuthCookie(res: ServerResponse, env: ApiEnv): void {
  res.appendHeader(
    'Set-Cookie',
    serializeCookie(OAUTH_COOKIE, '', {
      path: OAUTH_COOKIE_PATH,
      maxAgeSeconds: 0,
      secure: env.COOKIE_SECURE,
    }),
  );
}

const DEFAULT_RETURN_TO = '/app';

/** Only same-origin paths inside the admin app; everything else becomes `/app` (open redirect). */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512) return DEFAULT_RETURN_TO;
  if (value !== '/app' && !value.startsWith('/app/') && !value.startsWith('/app?')) {
    return DEFAULT_RETURN_TO;
  }
  if (value.includes('//') || value.includes('\\')) return DEFAULT_RETURN_TO;
  return value;
}
