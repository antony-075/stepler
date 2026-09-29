// Server only: imported from server components (it reads API_INTERNAL_URL).
import { type AuthMethodsResponse, authMethodsResponseSchema } from '@stepler/contracts';
import { getWebEnv } from '@/env';

/** Sign-in options, fetched from the API at request time; `null` when the API can't answer. */
export async function fetchAuthMethods(): Promise<AuthMethodsResponse | null> {
  try {
    const res = await fetch(new URL('/api/v1/auth/methods', getWebEnv().API_INTERNAL_URL), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const parsed = authMethodsResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
