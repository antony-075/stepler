import { z } from 'zod';
import { legalStatusSchema, legalVersionsSchema } from './legal.js';
import { NO_CONTROL_CHARACTERS } from './text.js';

export const localeSchema = z.enum(['uk', 'en']);
export type Locale = z.infer<typeof localeSchema>;

/** `GET /api/v1/me` and `PATCH /api/v1/me` response. */
export const meResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  locale: localeSchema,
  isOperator: z.boolean(),
  /**
   * Whether the account has a password (ADR 0019): settings offer «Змінити пароль» then, else
   * «Забули пароль?» sets the first one (an account from Google).
   */
  hasPassword: z.boolean(),
  /** Acceptance of the legal documents; the API refuses most routes until `accepted`. */
  legal: legalStatusSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * A person's name as they want it shown (the header, later the guests' view): plain text on one
 * line, 1–80 characters after trimming. Mirrored by `User_displayName_length` in the database.
 */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(NO_CONTROL_CHARACTERS, 'Must not contain control characters or line breaks');

/** `PATCH /api/v1/me`. `displayName: null` clears it; omitted fields are unchanged. */
export const updateMeRequestSchema = z
  .object({
    displayName: displayNameSchema.nullable().optional(),
    locale: localeSchema.optional(),
  })
  .strict();
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

/** An address as typed: trimmed and lowercased first, so the format check sees what is stored. */
export const emailAddressSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** A 32-byte base64url token as emailed (43 characters): e-mail verification, password reset. */
export const authTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/**
 * The password rules (owner 2026-10-16, ADR 0019), in the order the strength meter lists them.
 * Letters of any alphabet count (`\p{Lu}`, `\p{Ll}`); a special character is anything that is not
 * a letter, a digit or a space.
 */
export const PASSWORD_RULES = ['length', 'upper', 'lower', 'digit', 'special'] as const;
export type PasswordRule = (typeof PASSWORD_RULES)[number];

export const PASSWORD_MIN_LENGTH = 8;
/** Long passphrases are welcome; the cap only bounds the hashing work per request. */
export const PASSWORD_MAX_LENGTH = 128;

const RULE_TESTS: Record<PasswordRule, (password: string) => boolean> = {
  length: (p) => Array.from(p).length >= PASSWORD_MIN_LENGTH,
  upper: (p) => /\p{Lu}/u.test(p),
  lower: (p) => /\p{Ll}/u.test(p),
  digit: (p) => /\p{Nd}/u.test(p),
  special: (p) => /[^\p{L}\p{N}\s]/u.test(p),
};

/** Which rules `password` meets: the form's meter and the schema below share it. */
export function passwordChecks(password: string): Record<PasswordRule, boolean> {
  return Object.fromEntries(
    PASSWORD_RULES.map((rule) => [rule, RULE_TESTS[rule](password)]),
  ) as Record<PasswordRule, boolean>;
}

/** The rules `password` still misses, in `PASSWORD_RULES` order. */
export function missingPasswordRules(password: string): PasswordRule[] {
  const checks = passwordChecks(password);
  return PASSWORD_RULES.filter((rule) => !checks[rule]);
}

/** A new password: every rule, at most 128 characters, no control characters. */
export const newPasswordSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH)
  .regex(NO_CONTROL_CHARACTERS, 'Must not contain control characters or line breaks')
  .refine((password) => missingPasswordRules(password).length === 0, {
    message: 'The password does not meet the rules',
  });

/** A password as typed at sign-in: never checked against the rules (an older one still works). */
const typedPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);

/**
 * `POST /api/v1/auth/register`. The second «Підтвердіть пароль» field is the form's own check; the
 * API takes the password once. Always `202 {status: 'sent'}`: a taken address learns nothing here
 * (its mailbox gets a notice instead).
 */
export const registerRequestSchema = z
  .object({
    email: emailAddressSchema,
    password: newPasswordSchema,
    turnstileToken: z.string().min(1).max(2048),
    locale: localeSchema.optional(),
    /** The registration form's required checkbox: the versions accepted (ADR 0016). */
    legal: legalVersionsSchema,
  })
  .strict();
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** `POST /api/v1/auth/login`. Unknown address and wrong password answer the same `401`. */
export const loginRequestSchema = z
  .object({ email: emailAddressSchema, password: typedPasswordSchema })
  .strict();
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** `POST /api/v1/auth/verification` (send the verification mail again) and `/password/forgot`. */
export const authEmailRequestSchema = z
  .object({
    email: emailAddressSchema,
    turnstileToken: z.string().min(1).max(2048),
    locale: localeSchema.optional(),
  })
  .strict();
export type AuthEmailRequest = z.infer<typeof authEmailRequestSchema>;

/** Every request that may send a mail answers this, whether or not one was sent. */
export const authEmailSentResponseSchema = z.object({ status: z.literal('sent') }).strict();
export type AuthEmailSentResponse = z.infer<typeof authEmailSentResponseSchema>;

/** `POST /api/v1/auth/verification/preview` and `/verification/confirm`. */
export const authTokenRequestSchema = z.object({ token: authTokenSchema }).strict();
export type AuthTokenRequest = z.infer<typeof authTokenRequestSchema>;

/** The address a verification link confirms, shown before the person confirms it. */
export const verificationPreviewResponseSchema = z.object({ email: z.string() }).strict();
export type VerificationPreviewResponse = z.infer<typeof verificationPreviewResponseSchema>;

/**
 * `POST /api/v1/auth/account-deletion/preview` (ADR 0020): what the emailed deletion link
 * deletes, shown before the final confirmation. `collections` counts every collection that is
 * not already being deleted; `subscription` is a plan that would renew.
 */
export const accountDeletionPreviewResponseSchema = z
  .object({
    email: z.string(),
    collections: z.number().int().nonnegative(),
    subscription: z.boolean(),
  })
  .strict();
export type AccountDeletionPreviewResponse = z.infer<typeof accountDeletionPreviewResponseSchema>;

/** `POST /api/v1/auth/account-deletion/confirm`: the account is gone and signed out. */
export const accountDeletedResponseSchema = z.object({ status: z.literal('deleted') }).strict();
export type AccountDeletedResponse = z.infer<typeof accountDeletedResponseSchema>;

/** `POST /api/v1/auth/password/reset`: the emailed token and the new password. */
export const resetPasswordRequestSchema = z
  .object({ token: authTokenSchema, password: newPasswordSchema })
  .strict();
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/** `POST /api/v1/auth/password` (signed in): the current password, then the new one. */
export const changePasswordRequestSchema = z
  .object({ currentPassword: typedPasswordSchema, newPassword: newPasswordSchema })
  .strict();
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** Login, a confirmed address and a reset password all end signed in. */
export const signedInResponseSchema = z.object({ status: z.literal('signed-in') }).strict();
export type SignedInResponse = z.infer<typeof signedInResponseSchema>;

/**
 * `GET /api/v1/auth/methods`: sign-in options the web app renders, read at runtime, and the
 * current legal versions the registration form sends back once its checkbox is ticked.
 */
export const authMethodsResponseSchema = z
  .object({
    password: z.literal(true),
    google: z.boolean(),
    turnstileSiteKey: z.string(),
    legal: legalVersionsSchema,
  })
  .strict();
export type AuthMethodsResponse = z.infer<typeof authMethodsResponseSchema>;
