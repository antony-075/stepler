// Server only: imported from server components (it reads API_INTERNAL_URL).
import {
  type AuthMethodsResponse,
  authMethodsResponseSchema,
  type MeResponse,
  meResponseSchema,
} from '@stepler/contracts';
import { headers } from 'next/headers';
import { getWebEnv } from '@/env';

const API_TIMEOUT_MS = 5000;

/** Sign-in options, fetched from the API at request time; `null` when the API can't answer. */
export async function fetchAuthMethods(): Promise<AuthMethodsResponse | null> {
  try {
    const res = await fetch(new URL('/api/v1/auth/methods', getWebEnv().API_INTERNAL_URL), {
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const parsed = authMethodsResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The signed-in admin for the incoming request, resolved by the API (`GET /api/v1/me` with the
 * request's cookies): `null` when signed out, `'unavailable'` when the API can't answer.
 * Never cached: the answer belongs to this request's cookies only.
 */
export async function getSessionUser(): Promise<MeResponse | null | 'unavailable'> {
  const cookie = (await headers()).get('cookie');
  // No cookies at all cannot carry a session; skip the round trip.
  if (!cookie) return null;
  try {
    const res = await fetch(new URL('/api/v1/me', getWebEnv().API_INTERNAL_URL), {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (res.status === 401) return null;
    if (!res.ok) return 'unavailable';
    const parsed = meResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
