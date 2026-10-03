import { type ErrorCode, type ProblemDetails, problemDetailsSchema } from '@stepler/contracts';
import type { ZodType } from 'zod';

/** A failed API call, reduced to the stable error code the UI translates. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly requestId?: string,
    /** The whole problem body, for extension members such as `missingPartNumbers`. */
    readonly problem?: ProblemDetails,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

interface ApiRequestInit<T> extends Omit<RequestInit, 'body'> {
  /** Serialized as JSON. */
  body?: unknown;
  /** Validates the success body; omit for 204 responses. */
  schema?: ZodType<T>;
}

/**
 * Calls the API through the same-origin `/api` proxy. Types and schemas come from
 * `@stepler/contracts`, the same source the API validates with (ADR 0005).
 */
export async function apiRequest<T = undefined>(path: string, init: ApiRequestInit<T>): Promise<T> {
  const { body, schema, headers, ...rest } = init;
  const requestHeaders = new Headers(headers);
  if (body !== undefined) requestHeaders.set('content-type', 'application/json');

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...rest,
      headers: requestHeaders,
      credentials: 'same-origin',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    // A cancelled call stays a cancellation, not a network failure to retry.
    if (rest.signal?.aborted) throw error;
    throw new ApiError('UPSTREAM_UNAVAILABLE', 0);
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204 || schema === undefined) return undefined as T;
  const parsed = schema.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) throw new ApiError('UPSTREAM_UNAVAILABLE', res.status);
  return parsed.data;
}

async function toApiError(res: Response): Promise<ApiError> {
  const problem = problemDetailsSchema.safeParse(await res.json().catch(() => undefined));
  return problem.success
    ? new ApiError(problem.data.code, res.status, problem.data.requestId, problem.data)
    : new ApiError('UPSTREAM_UNAVAILABLE', res.status);
}

export function isApiError(error: unknown, code?: ErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
