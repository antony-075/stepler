// Server only: imported from the console's server components (it reads API_INTERNAL_URL).
import {
  type OperatorSession,
  operatorSessionSchema,
  problemDetailsSchema,
} from '@stepler/contracts';
import { headers } from 'next/headers';
import { getWebEnv } from '@/env';

const API_TIMEOUT_MS = 5000;

/**
 * Who is opening the console, asked of the API with the request's cookies ([P8]):
 * - the operator's session;
 * - `null` for a signed-in account that is not the operator (the console is a 404 for them);
 * - `'signed-out'` with no session, or one that has not accepted the legal documents (`/login`
 *   then sends it on to `/accept-terms`);
 * - `'unavailable'` when the API cannot answer.
 */
export async function getOperatorSession(): Promise<
  OperatorSession | null | 'signed-out' | 'unavailable'
> {
  const cookie = (await headers()).get('cookie');
  if (!cookie) return 'signed-out';
  try {
    const res = await fetch(new URL('/api/v1/operator/session', getWebEnv().API_INTERNAL_URL), {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (res.status === 401) return 'signed-out';
    if (res.status === 404) return null;
    if (res.status === 403) {
      const problem = problemDetailsSchema.safeParse(await res.json().catch(() => undefined));
      return problem.success && problem.data.code === 'LEGAL_ACCEPTANCE_REQUIRED'
        ? 'signed-out'
        : 'unavailable';
    }
    if (!res.ok) return 'unavailable';
    const parsed = operatorSessionSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
