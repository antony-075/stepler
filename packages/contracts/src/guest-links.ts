import { z } from 'zod';
import { themeSettingsSchema } from './guest-page.js';
import { NO_CONTROL_CHARACTERS } from './text.js';

/** `REVOKED` is terminal: a revoked link never works again and its token is no longer stored. */
export const guestLinkStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'REVOKED']);
export type GuestLinkStatus = z.infer<typeof guestLinkStatusSchema>;

type ContributionFlags = {
  canUploadPhotos: boolean;
  canUploadVideos: boolean;
  canUploadDocuments: boolean;
  canSubmitText: boolean;
};

/** Guests can add something: a photo, a video, a document or a wish. */
export const canContribute = (p: ContributionFlags): boolean =>
  p.canUploadPhotos || p.canUploadVideos || p.canUploadDocuments || p.canSubmitText;

/**
 * What a link lets guests do. Photos, videos and documents are separate permissions (owner,
 * 2026-10-02): a photographer's link may take photos and videos but not documents. Mirrored by
 * `GuestLink_has_capability` and `GuestLink_delete_own_needs_contribution` in the database. The
 * refinement messages are codes the web app translates.
 */
export const guestLinkPermissionsSchema = z
  .object({
    canUploadPhotos: z.boolean(),
    canUploadVideos: z.boolean(),
    canUploadDocuments: z.boolean(),
    canSubmitText: z.boolean(),
    canViewGallery: z.boolean(),
    canDeleteOwn: z.boolean(),
  })
  .strict()
  .refine((p) => canContribute(p) || p.canViewGallery, {
    message: 'NO_CAPABILITY',
    path: [],
  })
  .refine((p) => !p.canDeleteOwn || canContribute(p), {
    message: 'DELETE_OWN_REQUIRES_CONTRIBUTION',
    path: [],
  });
export type GuestLinkPermissions = z.infer<typeof guestLinkPermissionsSchema>;

/** Additional links only; the default link has none. Mirrored by `GuestLink_label_rules`. */
export const guestLinkLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(NO_CONTROL_CHARACTERS, 'Must not contain control characters or line breaks');

/**
 * A guest link as its collection's owner sees it. `url` is `null` once the link is revoked, and
 * for a live link whose stored token can no longer be decrypted (rotate or revoke it).
 */
export const guestLinkSchema = z
  .object({
    id: z.uuid(),
    isDefault: z.boolean(),
    label: z.string().nullable(),
    status: guestLinkStatusSchema,
    permissions: guestLinkPermissionsSchema,
    url: z.url().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type GuestLink = z.infer<typeof guestLinkSchema>;

/** `GET /api/v1/collections/:id/guest-links`: the default, live additional, then recently revoked. */
export const guestLinkListResponseSchema = z.object({ items: z.array(guestLinkSchema) }).strict();
export type GuestLinkListResponse = z.infer<typeof guestLinkListResponseSchema>;

/** `POST /api/v1/collections/:id/guest-links`: an additional link. */
export const createGuestLinkRequestSchema = z
  .object({ label: guestLinkLabelSchema, permissions: guestLinkPermissionsSchema })
  .strict();
export type CreateGuestLinkRequest = z.infer<typeof createGuestLinkRequestSchema>;

/** `PATCH /api/v1/guest-links/:id`. Omitted fields are unchanged. */
export const updateGuestLinkRequestSchema = z
  .object({
    label: guestLinkLabelSchema.optional(),
    permissions: guestLinkPermissionsSchema.optional(),
  })
  .strict()
  .refine((body) => body.label !== undefined || body.permissions !== undefined, {
    message: 'At least one field is required',
    path: [],
  });
export type UpdateGuestLinkRequest = z.infer<typeof updateGuestLinkRequestSchema>;

/**
 * `POST /api/v1/collections/:id/guest-links/default/rotate`. Rotating only when the live default
 * is still `expectedLinkId` makes a retried or doubled request a no-op.
 */
export const rotateDefaultLinkRequestSchema = z.object({ expectedLinkId: z.uuid() }).strict();
export type RotateDefaultLinkRequest = z.infer<typeof rotateDefaultLinkRequestSchema>;

export const guestLinkIdParamsSchema = z.object({ id: z.uuid() });

/**
 * `POST /api/v1/guest/links/resolve`. The token travels in the body to stay out of URLs and access
 * logs. Its exact format is checked by the service, so a malformed token is a 404 like an unknown one.
 */
export const resolveGuestLinkRequestSchema = z
  .object({ linkToken: z.string().min(1).max(200) })
  .strict();
export type ResolveGuestLinkRequest = z.infer<typeof resolveGuestLinkRequestSchema>;

/**
 * What a guest may learn about a live link: the collection id (not a secret; the guest needs it
 * for the session exchange [C3] and every later call), no link or owner ids, no other links.
 */
export const resolveGuestLinkResponseSchema = z
  .object({
    collectionId: z.uuid(),
    collection: z.object({ title: z.string(), description: z.string().nullable() }).strict(),
    permissions: guestLinkPermissionsSchema,
  })
  .strict();
export type ResolveGuestLinkResponse = z.infer<typeof resolveGuestLinkResponseSchema>;

/**
 * `POST /api/v1/guest/links/theme`: the look of a link's published guest page, so the page can be
 * drawn in its template from the first byte (loading, and the paused, closed and revoked states;
 * owner remarks 99, 100). The look only: no title, no ids, no permissions. Answered for a link in
 * any state while its collection exists; `404` for an unknown token or a collection gone.
 */
export const guestLinkThemeResponseSchema = z
  .object({
    templateId: z.string().min(1),
    templateVersion: z.number().int().min(1),
    settings: themeSettingsSchema,
  })
  .strict();
export type GuestLinkThemeResponse = z.infer<typeof guestLinkThemeResponseSchema>;
