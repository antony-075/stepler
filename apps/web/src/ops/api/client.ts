import { type ErrorCode, problemDetailsSchema } from '@stepler/contracts';
import type { ZodType } from 'zod';

/**
 * A failed console call, reduced to the stable error code. A deliberate copy of the user app's
 * `ApiError` (about 40 lines), so the ops folders move to their own app alone (plan "Console
 * architecture").
 */
export class OpsApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'OpsApiError';
  }
}

interface OpsRequestInit<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  /** Extra request headers (e.g. `Idempotency-Key` on a refund). */
  headers?: Record<string, string>;
  /** Serialized as JSON. */
  body?: unknown;
  /** Validates the success body; omit for 204 responses. */
  schema?: ZodType<T>;
  signal?: AbortSignal;
}

/** Calls `/api/v1/operator/*` on the same origin, through the web app's API proxy. */
export async function opsRequest<T = undefined>(
  path: `/operator/${string}`,
  init: OpsRequestInit<T> = {},
): Promise<T> {
  const { body, schema, method = 'GET', signal, headers = {} } = init;
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
      ...(body === undefined
        ? { headers }
        : {
            body: JSON.stringify(body),
            headers: { ...headers, 'content-type': 'application/json' },
          }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new OpsApiError('UPSTREAM_UNAVAILABLE', 0);
  }
  if (!res.ok) {
    const problem = problemDetailsSchema.safeParse(await res.json().catch(() => undefined));
    throw new OpsApiError(problem.success ? problem.data.code : 'UPSTREAM_UNAVAILABLE', res.status);
  }
  if (res.status === 204 || schema === undefined) return undefined as T;
  const parsed = schema.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) throw new OpsApiError('UPSTREAM_UNAVAILABLE', res.status);
  return parsed.data;
}

export const isOpsApiError = (error: unknown, code?: ErrorCode): error is OpsApiError =>
  error instanceof OpsApiError && (code === undefined || error.code === code);
