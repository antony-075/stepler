import { z } from 'zod';
import { codePointLength } from './content.js';
import { NO_CONTROL_CHARACTERS } from './text.js';

/**
 * The welcome message guests see above their main action [A5]: one short paragraph, in code
 * points (an emoji is one). Mirrored by `Collection_welcome_length` in the database.
 */
export const WELCOME_MESSAGE_MAX_CHARS = 160;

/** One paragraph like the title: no line breaks or control characters; trimmed. */
export const collectionWelcomeMessageSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      const length = codePointLength(value);
      return length >= 1 && length <= WELCOME_MESSAGE_MAX_CHARS;
    },
    { message: `Must be 1 to ${WELCOME_MESSAGE_MAX_CHARS} characters` },
  )
  .regex(NO_CONTROL_CHARACTERS, 'Must not contain control characters or line breaks');

/** A cover is `PENDING` until the worker made its derivatives, then `READY` or `FAILED`. */
export const coverStatusSchema = z.enum(['PENDING', 'READY', 'FAILED']);
export type CoverStatus = z.infer<typeof coverStatusSchema>;

const dimension = z.number().int().min(1);

/**
 * An admin image (a cover, a background or the collection image) as its owner sees it [A2]:
 * presigned URLs to the renditions the slot has, and the source's upright dimensions, once
 * `READY`; `null` before (and `largeUrl` is `null` for slots without a 2400 px rendition). Never
 * the source (upload or frame) or a frame id.
 */
export const adminImageSchema = z
  .object({
    status: coverStatusSchema,
    thumbnailUrl: z.url().nullable(),
    previewUrl: z.url().nullable(),
    largeUrl: z.url().nullable(),
    width: dimension.nullable(),
    height: dimension.nullable(),
  })
  .strict();
export type AdminImage = z.infer<typeof adminImageSchema>;

/**
 * The cover as guests see it: present only when `READY`, so there is never a status, and never
 * the frame it was taken from (deleting that frame does not touch the cover).
 */
export const guestCoverSchema = z
  .object({
    thumbnailUrl: z.url(),
    previewUrl: z.url(),
    width: dimension,
    height: dimension,
  })
  .strict();
export type GuestCover = z.infer<typeof guestCoverSchema>;

/** A guest page image (cover or background) as guests see it; `largeUrl` for backgrounds. */
export const guestImageSchema = guestCoverSchema.extend({ largeUrl: z.url().nullable() }).strict();
export type GuestImage = z.infer<typeof guestImageSchema>;

/** `POST /api/v1/collections/:id/cover/from-frame` [A8]: a PHOTO frame of the same collection. */
export const setCoverFromFrameRequestSchema = z.object({ contentItemId: z.uuid() }).strict();
export type SetCoverFromFrameRequest = z.infer<typeof setCoverFromFrameRequestSchema>;

/** `…/collections/:id/cover/uploads/:uploadId/…` path parameters. */
export const coverUploadParamsSchema = z.object({ id: z.uuid(), uploadId: z.uuid() });

/** The guest page image slots in admin paths: `…/guest-page/draft/{cover|background}…`. */
export const imageSlotParamSchema = z.enum(['cover', 'background']);
export type ImageSlotParam = z.infer<typeof imageSlotParamSchema>;
