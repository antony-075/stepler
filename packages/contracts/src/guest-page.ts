import { z } from 'zod';
import {
  adminImageSchema,
  collectionWelcomeMessageSchema,
  guestImageSchema,
  imageSlotParamSchema,
} from './cover.js';

/**
 * The guest page theme vocabulary (plan 2026-10-05, guest page templates): the settings an admin
 * can tune on top of a template. This is the API contract shape only; which values a template
 * allows (and which it locks) is `@stepler/templates/core`, which the API validates with too.
 */

/** The twelve curated fonts, all with Cyrillic, committed as woff2 (ADR 0015, ADR 0017). */
export const FONT_IDS = [
  'geologica',
  'manrope',
  'unbounded',
  'playfair-display',
  'cormorant',
  'lora',
  'nunito',
  'rubik',
  'montserrat-alternates',
  'comfortaa',
  'pt-serif',
  'golos-text',
] as const;
export type FontId = (typeof FONT_IDS)[number];

/** The editor's accent swatches; any other `#RRGGBB` is a custom colour. */
export const ACCENT_PRESETS = [
  { id: 'pencil', hex: '#B83E26' },
  { id: 'apricot', hex: '#F2A65A' },
  { id: 'plum', hex: '#5A4A8C' },
  { id: 'emerald', hex: '#2C7350' },
  { id: 'electric', hex: '#8B5CF6' },
  { id: 'lime', hex: '#C5F04A' },
] as const;

/** `#RRGGBB` in uppercase: one spelling per colour, so the web normalizes before sending. */
export const hexColorSchema = z.string().regex(/^#[0-9A-F]{6}$/, 'Must be a colour like #B83E26');
export type Hex = z.infer<typeof hexColorSchema>;

/** A stable slug (`classic`, `fullscreen`, …); mirrored by a CHECK in the database. */
const SLUG = /^[a-z][a-z0-9-]{0,39}$/;
export const templateIdSchema = z.string().regex(SLUG);

export const coverPlacementSchema = z.enum(['top', 'full', 'side', 'none']);
export type CoverPlacement = z.infer<typeof coverPlacementSchema>;

export const alignSchema = z.enum(['start', 'center']);
export type Align = z.infer<typeof alignSchema>;

export const cornersSchema = z.enum(['sharp', 'soft', 'round']);
export type Corners = z.infer<typeof cornersSchema>;

/** The background as an admin sets it: a colour, one of the template's gradients, or an image. */
export const backgroundSettingsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('solid'), color: hexColorSchema }).strict(),
  z.object({ kind: z.literal('gradient'), preset: z.string().regex(SLUG) }).strict(),
  /** `dim`: the veil over the image, in percent; the template sets the allowed range. */
  z.object({ kind: z.literal('image'), dim: z.number().int().min(0).max(90) }).strict(),
]);
export type BackgroundSettings = z.infer<typeof backgroundSettingsSchema>;
export type BackgroundKind = BackgroundSettings['kind'];

/** The tweaks on top of a template (strict: an unknown key is an error, not ignored). */
export const themeSettingsSchema = z
  .object({
    background: backgroundSettingsSchema,
    accent: hexColorSchema,
    /** The heading font; body text stays in the template's body face [D4]. */
    headingFont: z.enum(FONT_IDS),
    coverPlacement: coverPlacementSchema,
    align: alignSchema,
    corners: cornersSchema,
  })
  .strict();
export type ThemeSettings = z.infer<typeof themeSettingsSchema>;

const revision = z.number().int().min(1);

/**
 * One version of a collection's guest page as its owner sees it: the template (as stored), its
 * settings (resolved: a removed template or invalid settings read as the defaults), the welcome
 * and the two images. The published version is what guests see; the draft is the editor's.
 */
export const guestPageVersionSchema = z
  .object({
    templateId: templateIdSchema,
    templateVersion: z.number().int().min(1),
    settings: themeSettingsSchema,
    welcomeMessage: z.string().nullable(),
    cover: adminImageSchema.nullable(),
    background: adminImageSchema.nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type GuestPageVersion = z.infer<typeof guestPageVersionSchema>;

/**
 * `GET /api/v1/collections/:id/guest-page`: the published version and, while the admin edits,
 * the draft with its `revision` (optimistic concurrency: a save names the revision it started
 * from). Guests see only the published one.
 */
export const guestPageEditorSchema = z
  .object({
    published: guestPageVersionSchema,
    draft: guestPageVersionSchema.extend({ revision }).strict().nullable(),
  })
  .strict();
export type GuestPageEditor = z.infer<typeof guestPageEditorSchema>;

/**
 * `PUT /api/v1/collections/:id/guest-page/draft`: the whole working copy. `baseRevision` is the
 * draft revision the editor started from, `null` when there was no draft yet; anything else than
 * the current one is `409 GUEST_PAGE_DRAFT_CONFLICT`. Images change through their own routes.
 */
export const saveGuestPageDraftRequestSchema = z
  .object({
    baseRevision: revision.nullable(),
    templateId: templateIdSchema,
    settings: themeSettingsSchema,
    welcomeMessage: collectionWelcomeMessageSchema.nullable(),
  })
  .strict();
export type SaveGuestPageDraftRequest = z.infer<typeof saveGuestPageDraftRequestSchema>;

/** `POST /api/v1/collections/:id/guest-page/publish`: the draft revision being published. */
export const publishGuestPageRequestSchema = z.object({ revision }).strict();
export type PublishGuestPageRequest = z.infer<typeof publishGuestPageRequestSchema>;

/**
 * The published guest page as guests see it (inside the guest context): never the draft, a
 * revision or an image's status; images only once `READY`.
 */
export const guestPageSchema = z
  .object({
    templateId: templateIdSchema,
    templateVersion: z.number().int().min(1),
    settings: themeSettingsSchema,
    welcomeMessage: z.string().nullable(),
    cover: guestImageSchema.nullable(),
    background: guestImageSchema.nullable(),
  })
  .strict();
export type GuestPage = z.infer<typeof guestPageSchema>;

/** `…/guest-page/draft/:slot` path parameters. */
export const guestPageImageParamsSchema = z.object({ id: z.uuid(), slot: imageSlotParamSchema });
/** `…/guest-page/draft/:slot/uploads/:uploadId…` path parameters. */
export const guestPageImageUploadParamsSchema = z.object({
  id: z.uuid(),
  slot: imageSlotParamSchema,
  uploadId: z.uuid(),
});
