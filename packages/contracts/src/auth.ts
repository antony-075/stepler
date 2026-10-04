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

/** A 32-byte base64url token as emailed (43 characters). */
const magicLinkTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** `POST /api/v1/auth/magic-link`. */
export const magicLinkRequestSchema = z
  .object({
    // Normalize first: the format check must see the trimmed, lowercased address.
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    turnstileToken: z.string().min(1).max(2048),
    locale: localeSchema.optional(),
    /** The sign-in card's required checkbox: the versions accepted (owner decision L1). */
    legal: legalVersionsSchema,
  })
  .strict();
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

/** Always the same body, whether or not an email was sent (no account enumeration). */
export const magicLinkRequestResponseSchema = z.object({ status: z.literal('sent') }).strict();
export type MagicLinkRequestResponse = z.infer<typeof magicLinkRequestResponseSchema>;

/** `POST /api/v1/auth/magic-link/preview` and `/verify`. */
export const magicLinkVerifyRequestSchema = z.object({ token: magicLinkTokenSchema }).strict();
export type MagicLinkVerifyRequest = z.infer<typeof magicLinkVerifyRequestSchema>;

/** The address a link signs in to, shown before the user confirms. */
export const magicLinkPreviewResponseSchema = z.object({ email: z.string() }).strict();
export type MagicLinkPreviewResponse = z.infer<typeof magicLinkPreviewResponseSchema>;

export const magicLinkVerifyResponseSchema = z.object({ status: z.literal('signed-in') }).strict();
export type MagicLinkVerifyResponse = z.infer<typeof magicLinkVerifyResponseSchema>;

/**
 * `GET /api/v1/auth/methods`: sign-in options the web app renders, read at runtime, and the
 * current legal versions the sign-in card sends back once its checkbox is ticked.
 */
export const authMethodsResponseSchema = z
  .object({
    magicLink: z.literal(true),
    google: z.boolean(),
    turnstileSiteKey: z.string(),
    legal: legalVersionsSchema,
  })
  .strict();
export type AuthMethodsResponse = z.infer<typeof authMethodsResponseSchema>;
