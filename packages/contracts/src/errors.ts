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
  'COLLECTION_LIMIT_REACHED',
  'GUEST_LINK_LIMIT_REACHED',
  'LINK_REVOKED',
  'LINK_INACTIVE',
  'DEFAULT_LINK_NOT_REVOCABLE',
  'COLLECTION_ARCHIVED',
  'COLLECTION_UNAVAILABLE',
  'GUEST_SESSION_REQUIRED',
  'QUOTA_EXCEEDED',
  'FILE_TYPE_NOT_ALLOWED',
  'FILE_TOO_LARGE',
  'UPLOAD_SIZE_MISMATCH',
  'UPLOAD_INCOMPLETE',
  'UPLOAD_EXPIRED',
  'UPLOAD_CLOSED',
  'IDEMPOTENCY_CONFLICT',
  'CONTENT_NOT_FOUND',
  'UPLOAD_IN_PROGRESS',
  'COVER_SOURCE_INVALID',
  'LEGAL_ACCEPTANCE_REQUIRED',
  'LEGAL_VERSION_OUTDATED',
  'GUEST_PAGE_DRAFT_CONFLICT',
  'THEME_CONTRAST_TOO_LOW',
  'CONTENT_MODERATED',
  'REPORT_RESOLVED',
  // Slice 9b: appeals.
  'APPEAL_NOT_APPLICABLE',
  'APPEAL_OPEN',
  'APPEAL_RESOLVED',
  // Billing (ADR 0018).
  'ACCOUNT_READ_ONLY',
  'COLLECTION_READ_ONLY',
  'COLLECTING_CLOSED',
  'OFFER_UNAVAILABLE',
  'PAYMENT_PENDING',
  'PLAN_DOWNGRADE_BLOCKED',
  'SUBSCRIPTION_EXISTS',
  'REFUND_EXCEEDS_PAID',
  'PAYMENT_PROVIDER_UNAVAILABLE',
  'BILLING_SIGNATURE_INVALID',
  // E-mail + password sign-in (ADR 0019). `MAGIC_LINK_INVALID` above is no longer returned.
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_VERIFIED',
  'AUTH_TOKEN_INVALID',
  'CURRENT_PASSWORD_INVALID',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * RFC 9457 `application/problem+json` body returned by every API error. Loose: RFC 9457 allows
 * extension members, so clients must accept fields they don't know.
 */
export const problemDetailsSchema = z.looseObject({
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
