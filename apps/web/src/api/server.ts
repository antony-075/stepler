// Server only: imported from server components (it reads API_INTERNAL_URL).
import {
  type AuthMethodsResponse,
  authMethodsResponseSchema,
  type GuestLinkThemeResponse,
  guestLinkThemeResponseSchema,
  type MeResponse,
  meResponseSchema,
} from '@stepler/contracts';
import { headers } from 'next/headers';
import { upstreamRequestHeaders } from '@/api-proxy/forward';
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

/** The look must not hold the page up: past this the page starts in the neutral look. */
const THEME_TIMEOUT_MS = 1500;

/**
 * The look of a guest link's published page (owner remarks 99, 100), fetched while `/g/{token}`
 * renders on the server, so the first paint (the loading screen, a link state) is already in the
 * template: no flash from the app's look. The client IP is forwarded as the API proxy does, so
 * the per-IP limit counts the guest, not this server. `null` when there is none (an unknown
 * link) or the API is slow or down: the page then starts neutral, as before.
 */
export async function fetchGuestLinkTheme(token: string): Promise<GuestLinkThemeResponse | null> {
  const env = getWebEnv();
  const forwarded = upstreamRequestHeaders(await headers(), {
    clientIpHeader: env.CLIENT_IP_HEADER,
  });
  const ip = forwarded.get('x-forwarded-for');
  try {
    const res = await fetch(new URL('/api/v1/guest/links/theme', env.API_INTERNAL_URL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(ip === null ? {} : { 'x-forwarded-for': ip }),
      },
      body: JSON.stringify({ linkToken: token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(THEME_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const parsed = guestLinkThemeResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
