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
