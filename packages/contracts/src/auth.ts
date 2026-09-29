import { z } from 'zod';

export const localeSchema = z.enum(['uk', 'en']);
export type Locale = z.infer<typeof localeSchema>;

/** `GET /api/v1/me` and `PATCH /api/v1/me` response. */
export const meResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  locale: localeSchema,
  isOperator: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** `PATCH /api/v1/me`. `displayName: null` clears it; omitted fields are unchanged. */
export const updateMeRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).nullable().optional(),
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
