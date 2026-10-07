import { z } from 'zod';

export const bool = z.stringbool({ truthy: ['true', '1'], falsy: ['false', '0'] });
export const positiveInt = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
const byteCount = (fallback: bigint) =>
  z
    .string()
    .regex(/^\d+$/)
    .transform((value) => BigInt(value))
    .default(fallback);

/** `https://host[:port]` with no path, query or fragment: public URLs are built from it. */
const origin = z.url({ protocol: /^https?$/ }).refine((value) => new URL(value).origin === value);

/** Root key for HKDF-derived keys; base64 of at least 32 random bytes. */
const appSecret = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .transform((value) => Buffer.from(value, 'base64'))
  .refine((bytes) => bytes.length >= 32);

/** Express `trust proxy`: `false`, a hop count, or a trust string such as `loopback`. */
const trustProxy = z
  .string()
  .min(1)
  // `true` would trust every hop, so any client could spoof its IP via X-Forwarded-For.
  .refine((value) => value !== 'true')
  .transform((value): boolean | number | string => {
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return Number(value);
    return value;
  });

const emailList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  )
  .pipe(z.array(z.email()));

/**
 * Mail and the links in it: the API sends sign-in mail, the worker the report mail (slice 9,
 * [P1]), so both read these. `OPERATOR_EMAILS` is the Stepler operator's dedicated service
 * mailbox (ADR 0013), never a personal account.
 */
export const mailEnvShape = {
  APP_ORIGIN: origin,
  OPERATOR_EMAILS: emailList.default([]),
  SMTP_URL: z.url({ protocol: /^smtps?$/ }),
  MAIL_FROM: z.string().regex(/^[^<>]+ <[^<>\s]+@[^<>\s]+>$/),
  /** Where users write about moderation decisions; optional (drafts of the legal texts). */
  LEGAL_CONTACT_EMAIL: z.email().optional(),
};

/**
 * Payments (ADR 0018): the API builds checkouts and receives callbacks, the worker reconciles
 * through the provider's `status` API, so both read these. `disabled` (the default) is honest:
 * checkout answers `503 PAYMENT_PROVIDER_UNAVAILABLE` and nothing is granted (rule 18). The
 * private key is never logged, returned or put in a job payload.
 */
export const billingEnvShape = {
  BILLING_PROVIDER: z.enum(['liqpay', 'disabled']).default('disabled'),
  LIQPAY_PUBLIC_KEY: z.string().min(1).optional(),
  LIQPAY_PRIVATE_KEY: z.string().min(1).optional(),
  /** Server-to-server calls (`/api/request`); tests point it at a local stub. */
  LIQPAY_API_BASE: origin.default('https://www.liqpay.ua'),
  /**
   * Our public callback URL (`server_url`). Optional outside production: LiqPay cannot reach
   * localhost, and the return page's `status` refresh settles payments without it [P7].
   */
  BILLING_CALLBACK_URL: z.url({ protocol: /^https?$/ }).optional(),
  /** A checkout stays payable this long (also LiqPay's `expired_date`). */
  BILLING_PENDING_TTL_MINUTES: positiveInt(30),
  /** Fiscal receipts [P14]: `liqpay_rro` adds `rro_info` to every checkout. */
  BILLING_FISCAL_MODE: z.enum(['none', 'liqpay_rro']).default('none'),
  /** Set deliberately after the accountant's answer ([Q1]) to run live keys without receipts. */
  BILLING_FISCAL_WAIVED: bool.default(false),
};

type BillingEnv = {
  NODE_ENV: 'development' | 'test' | 'production';
  BILLING_PROVIDER: 'liqpay' | 'disabled';
  LIQPAY_PUBLIC_KEY?: string | undefined;
  LIQPAY_PRIVATE_KEY?: string | undefined;
  BILLING_CALLBACK_URL?: string | undefined;
  BILLING_FISCAL_MODE: 'none' | 'liqpay_rro';
  BILLING_FISCAL_WAIVED: boolean;
};

/**
 * Cross-field rules of `billingEnvShape`, shared by the API's and the worker's schema: LiqPay
 * needs both keys; live keys in production need a fiscal
 * mode or the deliberate waiver ([P14], [Q1]).
 */
export function checkBillingEnv(env: BillingEnv, ctx: z.RefinementCtx): void {
  if (env.BILLING_PROVIDER !== 'liqpay') return;
  for (const name of ['LIQPAY_PUBLIC_KEY', 'LIQPAY_PRIVATE_KEY'] as const) {
    if (env[name] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: 'required with BILLING_PROVIDER=liqpay',
      });
    }
  }
  if (env.NODE_ENV !== 'production') return;
  const live = env.LIQPAY_PUBLIC_KEY !== undefined && !env.LIQPAY_PUBLIC_KEY.startsWith('sandbox_');
  if (live && env.BILLING_FISCAL_MODE === 'none' && !env.BILLING_FISCAL_WAIVED) {
    ctx.addIssue({
      code: 'custom',
      path: ['BILLING_FISCAL_MODE'],
      message: 'live keys need liqpay_rro or BILLING_FISCAL_WAIVED=true',
    });
  }
}

/** Variables the API and the worker (`worker/worker-env.ts`) both read. */
export const sharedEnvShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool.default(false),
  /**
   * Presigned upload URLs live this long (spec §10.2). The worker needs it too: a collection's
   * purge waits until every URL issued before deletion has expired.
   */
  UPLOAD_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(7 * 24 * 3600)
    .default(900),
  /**
   * Storage calls fail after this long (503, retryable) instead of holding a request; the
   * assembly of a large multipart upload gets the longer one (review I2).
   */
  S3_REQUEST_TIMEOUT_MS: positiveInt(15_000),
  S3_COMPLETE_TIMEOUT_MS: positiveInt(60_000),
};

const apiEnvSchema = z
  .object({
    ...sharedEnvShape,
    ...mailEnvShape,
    ...billingEnvShape,
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    COOKIE_SECURE: bool.optional(),
    SESSION_TTL_DAYS: positiveInt(30),
    MAGIC_LINK_TTL_MINUTES: positiveInt(15),
    API_TRUST_PROXY: trustProxy.default(false),
    APP_SECRET: appSecret,

    TURNSTILE_SITE_KEY: z.string().min(1),
    TURNSTILE_SECRET_KEY: z.string().min(1),

    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    LIMIT_MAGIC_LINK_PER_EMAIL_PER_HOUR: positiveInt(5),
    LIMIT_MAGIC_LINK_PER_IP_PER_HOUR: positiveInt(20),
    LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR: positiveInt(60),
    // Active collections, storage and guest links come from entitlements now (ADR 0018); the
    // creations per day stay here: abuse, not sold.
    LIMIT_COLLECTION_CREATIONS_PER_DAY: positiveInt(10),
    LIMIT_GUEST_LINK_RESOLVE_PER_IP_PER_MINUTE: positiveInt(120),
    LIMIT_GUEST_SESSIONS_PER_IP_PER_MINUTE: positiveInt(120),
    LIMIT_TEXTS_PER_IP_PER_MINUTE: positiveInt(60),
    LIMIT_GUEST_READS_PER_IP_PER_MINUTE: positiveInt(600),
    LIMIT_GUEST_WRITES_PER_IP_PER_MINUTE: positiveInt(120),
    // Guest reports (slice 9): per client IP per hour (in memory), per guest session per hour
    // (counted from rows, like texts).
    LIMIT_REPORTS_PER_IP_PER_HOUR: positiveInt(60),
    LIMIT_REPORTS_PER_GUEST_SESSION_PER_HOUR: positiveInt(10),
    // Slice 9b: appeals per admin account per rolling 24 hours (counted from rows), and how long
    // a frame the operator deleted stays restorable before the purge.
    LIMIT_APPEALS_PER_ACCOUNT_PER_DAY: positiveInt(20),
    MODERATION_QUARANTINE_DAYS: positiveInt(90),
    // Per-file maxima by kind (D2, decimal units) and the files a guest may pick at once.
    LIMIT_FILE_BYTES_PHOTO: byteCount(50_000_000n),
    LIMIT_FILE_BYTES_VIDEO: byteCount(2_000_000_000n),
    LIMIT_FILE_BYTES_DOCUMENT: byteCount(50_000_000n),
    LIMIT_FILES_PER_BATCH: positiveInt(100),
    LIMIT_TEXTS_PER_GUEST_SESSION_PER_HOUR: positiveInt(60),
    LIMIT_UPLOAD_INITIATIONS_PER_GUEST_SESSION_PER_HOUR: positiveInt(300),
    LIMIT_CONCURRENT_UPLOADS_PER_GUEST_SESSION: positiveInt(10),
    // Upload API calls per minute and route: per client IP (venue NAT: generous) and per guest
    // session (review I2).
    LIMIT_UPLOAD_CALLS_PER_IP_PER_MINUTE: positiveInt(600),
    LIMIT_UPLOAD_CALLS_PER_GUEST_SESSION_PER_MINUTE: positiveInt(240),
    // The admin's cover routes (upload, from-frame, remove) per minute and route: per client IP
    // and per signed-in user.
    LIMIT_ADMIN_COVER_CALLS_PER_IP_PER_MINUTE: positiveInt(120),
    LIMIT_ADMIN_COVER_CALLS_PER_USER_PER_MINUTE: positiveInt(60),
    // Upload protocol (spec §10.2): every file is a multipart upload of parts this size (the last
    // shorter). S3 and R2 need parts of at least 5 MiB (except the last).
    UPLOAD_PART_SIZE_BYTES: byteCount(10_485_760n).refine((value) => value >= 5_242_880n, {
      message: 'at least 5242880',
    }),
    UPLOAD_SESSION_TTL_HOURS: positiveInt(24),
    // Media GET URLs are signed per window of this length and valid for two (spec §10.6).
    MEDIA_URL_WINDOW_SECONDS: positiveInt(3600),
    // Billing (ADR 0018): the public callback per IP per minute; checkouts per account per hour.
    LIMIT_BILLING_CALLBACKS_PER_IP_PER_MINUTE: positiveInt(120),
    LIMIT_BILLING_CHECKOUTS_PER_USER_PER_HOUR: positiveInt(20),
  })
  .superRefine((env, ctx) => {
    checkBillingEnv(env, ctx);
    // Only the API hands LiqPay a `server_url`; production must receive callbacks.
    if (
      env.BILLING_PROVIDER === 'liqpay' &&
      env.NODE_ENV === 'production' &&
      env.BILLING_CALLBACK_URL === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['BILLING_CALLBACK_URL'],
        message: 'required in production',
      });
    }
    if ((env.GOOGLE_CLIENT_ID === undefined) !== (env.GOOGLE_CLIENT_SECRET === undefined)) {
      for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) {
        ctx.addIssue({ code: 'custom', path: [name], message: 'set both or neither' });
      }
    }
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }));

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Names the invalid variables only; values may contain secrets and are never included. */
export class EnvValidationError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Invalid or missing environment variables: ${variables.join(', ')}`);
    this.name = 'EnvValidationError';
  }
}

/** Parses `source` with `schema`; throws `EnvValidationError` naming the invalid variables. */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined>,
): z.infer<S> {
  // Empty strings (e.g. `S3_ENDPOINT=` in an env file) mean "unset".
  const defined = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = schema.safeParse(defined);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new EnvValidationError(names);
  }
  return result.data;
}

export function loadApiEnv(source: Record<string, string | undefined>): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}

/**
 * Limits that became entitlements (ADR 0018): their values moved to the seeded trial offer. Still
 * accepted (ignored) for one release so existing deployments keep starting; `main.ts` warns.
 */
export const RETIRED_LIMIT_VARIABLES = [
  'LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT',
  'LIMIT_STORAGE_BYTES_PER_ACCOUNT',
  'LIMIT_STORAGE_BYTES_PER_COLLECTION',
  'LIMIT_GUEST_LINKS_PER_COLLECTION',
] as const;

/** The retired variables that are still set: names only, never values. */
export function retiredVariablesIn(source: Record<string, string | undefined>): string[] {
  return RETIRED_LIMIT_VARIABLES.filter((name) => source[name] !== undefined);
}
