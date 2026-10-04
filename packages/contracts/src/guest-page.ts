import { z } from 'zod';

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
