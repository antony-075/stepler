import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiEnv } from '../config/env.js';

export const SESSION_COOKIE = 'st_session';

/** Reads one cookie from the raw header; no cookie-parser middleware is needed. */
export function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

interface CookieOptions {
  path: string;
  maxAgeSeconds: number;
  secure: boolean;
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function setSessionCookie(
  res: ServerResponse,
  token: string,
  expiresAt: Date,
  env: ApiEnv,
): void {
  res.appendHeader(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, token, {
      path: '/',
      maxAgeSeconds: (expiresAt.getTime() - Date.now()) / 1000,
      secure: env.COOKIE_SECURE,
    }),
  );
}

export function clearSessionCookie(res: ServerResponse, env: ApiEnv): void {
  res.appendHeader(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, '', { path: '/', maxAgeSeconds: 0, secure: env.COOKIE_SECURE }),
  );
}
