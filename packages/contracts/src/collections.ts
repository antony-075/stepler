import { z } from 'zod';
import { adminImageSchema, collectionCoverSchema } from './cover.js';
import { storageUsageSchema } from './usage.js';
import { guestLinkPermissionsSchema } from './guest-links.js';
import {
  NO_CONTROL_CHARACTERS,
  NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS,
} from './text.js';

export { NO_CONTROL_CHARACTERS } from './text.js';

/** Plain text on one line, rendered escaped. Mirrored by `Collection_title_length` in the database. */
export const collectionTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(NO_CONTROL_CHARACTERS, 'Must not contain control characters or line breaks');

/** Plain text with line breaks and tabs kept. Mirrored by `Collection_description_length`. */
export const collectionDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .regex(NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS, 'Must not contain control characters');

/** The statuses the API exposes. `DELETING` is internal and never leaves the server. */
export const collectionStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export type CollectionStatus = z.infer<typeof collectionStatusSchema>;

/** A collection as its owner sees it. */
export const collectionSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    description: z.string().nullable(),
    status: collectionStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().nullable(),
    /** The live default guest link's status; `null` until a pre-slice-2 collection gets one. */
    defaultLinkStatus: z.enum(['ACTIVE', 'INACTIVE']).nullable(),
    /**
     * What the live default link lets guests do (the dashboard and the settings summary show
     * it); `null` with `defaultLinkStatus`. Permissions stay per link: this is a read-only copy.
     */
    defaultLinkPermissions: guestLinkPermissionsSchema.nullable(),
    /** Non-deleted frames of every kind. */
    contentCount: z.number().int().min(0),
    /** When the newest non-deleted frame was added; `null` while there is none. */
    lastContentAt: z.iso.datetime().nullable(),
    /**
     * Bytes the collection holds, by the storage line's definition (its frames' files and
     * renditions, its admin images, open upload reservations), so the cards add up to it.
     */
    storageBytes: z.number().int().min(0),
    /** Shown to guests above their main action; `null` = hidden [A5]. */
    welcomeMessage: z.string().nullable(),
    /** The cover (an upload or a guest photo frame); `null` = the initials tile [A2]. */
    cover: collectionCoverSchema.nullable(),
    /** «Картинка колекції»: the owner's own image of it, for the dashboard; never shown to guests. */
    image: adminImageSchema.nullable(),
  })
  .strict();
export type Collection = z.infer<typeof collectionSchema>;

/** `GET /api/v1/collections/:id`: the collection plus its storage use (not in lists). */
export const collectionDetailSchema = collectionSchema
  .extend({ storage: storageUsageSchema })
  .strict();
export type CollectionDetail = z.infer<typeof collectionDetailSchema>;

/** `POST /api/v1/collections`. */
export const createCollectionRequestSchema = z
  .object({
    title: collectionTitleSchema,
    description: collectionDescriptionSchema.nullable().optional(),
  })
  .strict();
export type CreateCollectionRequest = z.infer<typeof createCollectionRequestSchema>;

/**
 * `PATCH /api/v1/collections/:id`. `description: null` clears it; omitted fields are unchanged.
 * The welcome message is part of the guest page (`PUT …/guest-page/draft`), not of this.
 */
export const updateCollectionRequestSchema = z
  .object({
    title: collectionTitleSchema.optional(),
    description: collectionDescriptionSchema.nullable().optional(),
  })
  .strict();
export type UpdateCollectionRequest = z.infer<typeof updateCollectionRequestSchema>;

export const collectionIdParamsSchema = z.object({ id: z.uuid() });

/** `GET /api/v1/collections`: one status at a time, newest first, cursor-paginated. */
export const listCollectionsQuerySchema = z
  .object({
    status: collectionStatusSchema.default('ACTIVE'),
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type ListCollectionsQuery = z.infer<typeof listCollectionsQuerySchema>;

export const collectionListResponseSchema = z
  .object({ items: z.array(collectionSchema), nextCursor: z.string().nullable() })
  .strict();
export type CollectionListResponse = z.infer<typeof collectionListResponseSchema>;
