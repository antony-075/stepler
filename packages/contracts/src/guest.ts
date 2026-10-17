import { z } from 'zod';
import { guestContributionSchema } from './access.js';
import { guestNameSchema } from './content.js';
import { guestLinkPermissionsSchema } from './guest-links.js';
import { guestPageSchema } from './guest-page.js';

/**
 * `POST /api/v1/guest/collections/:collectionId/session` [C3]: exchanges the link token from the
 * address bar for the per-collection guest session cookie (or re-binds the one the browser sends).
 */
export const guestSessionRequestSchema = z
  .object({ linkToken: z.string().min(1).max(200) })
  .strict();
export type GuestSessionRequest = z.infer<typeof guestSessionRequestSchema>;

const count = z.number().int().min(0);

/**
 * Everything the guest page needs. No session, link or owner ids: the session lives only in the
 * HttpOnly cookie. `counts` is `null` unless the link shows the shared gallery (DESIGN-SYSTEM §11.3).
 * `page` is the published guest page (template, settings, welcome, images); never a draft.
 */
export const guestContextSchema = z
  .object({
    collection: z
      .object({
        id: z.uuid(),
        title: z.string(),
        description: z.string().nullable(),
      })
      .strict(),
    page: guestPageSchema,
    permissions: guestLinkPermissionsSchema,
    /** `nameAnswered` is true once the guest saved or skipped the name prompt [O4]. */
    guest: z.object({ name: z.string().nullable(), nameAnswered: z.boolean() }).strict(),
    limits: z
      .object({
        maxFileBytes: z.object({ photo: count, video: count, document: count }).strict(),
        filesPerBatch: count,
        textMaxChars: count,
      })
      .strict(),
    counts: z
      .object({ total: count, lastAddedAt: z.iso.datetime().nullable() })
      .strict()
      .nullable(),
    /**
     * Whether guests may still add anything (ADR 0018 [P2]): `OPEN` = the link's permissions
     * apply; `COLLECTING_CLOSED` / `READ_ONLY` = the page shows the gallery (if the link allows
     * it) and a closed state instead of the upload and text entry. Never says why.
     */
    contribution: guestContributionSchema,
  })
  .strict();
export type GuestContext = z.infer<typeof guestContextSchema>;

/** `PATCH /api/v1/guest/collections/:collectionId/session`: `name: null` skips or clears it. */
export const updateGuestSessionRequestSchema = z
  .object({ name: guestNameSchema.nullable() })
  .strict();
export type UpdateGuestSessionRequest = z.infer<typeof updateGuestSessionRequestSchema>;

export const guestCollectionParamsSchema = z.object({ collectionId: z.uuid() });
export const guestContentParamsSchema = z.object({ collectionId: z.uuid(), id: z.uuid() });
