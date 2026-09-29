import { z } from 'zod';

/**
 * Stable machine-readable error codes. The web app translates them; the API never returns
 * localized prose. Append only: removing or renaming a code is a breaking API change.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CSRF_ORIGIN_MISMATCH',
  'RATE_LIMITED',
  'TURNSTILE_FAILED',
  'MAGIC_LINK_INVALID',
  'OAUTH_FAILED',
  'ACCOUNT_BLOCKED',
  'UPSTREAM_UNAVAILABLE',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** RFC 9457 `application/problem+json` body returned by every API error. */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.enum(ERROR_CODES),
  detail: z.string().optional(),
  retryable: z.boolean(),
  requestId: z.string().optional(),
  errors: z
    .array(
      z.object({
        path: z.array(z.union([z.string(), z.number()])),
        message: z.string(),
      }),
    )
    .optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
