import { z } from 'zod';

const GIB = 1024n ** 3n;

const bool = z.stringbool({ truthy: ['true', '1'], falsy: ['false', '0'] });
const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);
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

const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    APP_ORIGIN: origin,
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    COOKIE_SECURE: bool.optional(),
    SESSION_TTL_DAYS: positiveInt(30),
    MAGIC_LINK_TTL_MINUTES: positiveInt(15),
    OPERATOR_EMAILS: emailList.default([]),
    API_TRUST_PROXY: trustProxy.default(false),
    APP_SECRET: appSecret,

    SMTP_URL: z.url({ protocol: /^smtps?$/ }),
    MAIL_FROM: z.string().regex(/^[^<>]+ <[^<>\s]+@[^<>\s]+>$/),

    TURNSTILE_SITE_KEY: z.string().min(1),
    TURNSTILE_SECRET_KEY: z.string().min(1),

    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: bool.default(false),

    LIMIT_MAGIC_LINK_PER_EMAIL_PER_HOUR: positiveInt(5),
    LIMIT_MAGIC_LINK_PER_IP_PER_HOUR: positiveInt(20),
    LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR: positiveInt(60),
    LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT: positiveInt(3),
    LIMIT_COLLECTION_CREATIONS_PER_DAY: positiveInt(10),
    LIMIT_STORAGE_BYTES_PER_ACCOUNT: byteCount(20n * GIB),
    LIMIT_STORAGE_BYTES_PER_COLLECTION: byteCount(10n * GIB),
    LIMIT_GUEST_LINKS_PER_COLLECTION: positiveInt(10),
  })
  .superRefine((env, ctx) => {
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

export function loadApiEnv(source: Record<string, string | undefined>): ApiEnv {
  // Empty strings (e.g. `S3_ENDPOINT=` in an env file) mean "unset".
  const defined = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = apiEnvSchema.safeParse(defined);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new EnvValidationError(names);
  }
  return result.data;
}
