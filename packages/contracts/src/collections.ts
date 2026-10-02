import { z } from 'zod';

// PostgreSQL text cannot store NUL, and other C0 control characters have no place in plain text.
// Matching control characters is the point of these patterns, hence the lint exceptions.
// eslint-disable-next-line no-control-regex
export const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001f]*$/;
const NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS =
  // eslint-disable-next-line no-control-regex
  /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f]*$/;

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
  })
  .strict();
export type Collection = z.infer<typeof collectionSchema>;

/** `POST /api/v1/collections`. */
export const createCollectionRequestSchema = z
  .object({
    title: collectionTitleSchema,
    description: collectionDescriptionSchema.nullable().optional(),
  })
  .strict();
export type CreateCollectionRequest = z.infer<typeof createCollectionRequestSchema>;

/** `PATCH /api/v1/collections/:id`. `description: null` clears it; omitted fields are unchanged. */
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
