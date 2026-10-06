import { z } from 'zod';
import { adminReportSchema, contentModerationSchema } from './reports.js';
import {
  codePointLength,
  NO_CONTROL_CHARACTERS,
  NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS,
} from './text.js';

/** What a frame holds. Texts share the collection's frame-number sequence (ADR 0015). */
export const contentKindSchema = z.enum(['PHOTO', 'VIDEO', 'DOCUMENT', 'TEXT']);
export type ContentKind = z.infer<typeof contentKindSchema>;

/** Texts and documents are `NOT_REQUIRED`; photos and videos are `PENDING` until the worker ends. */
export const processingStatusSchema = z.enum(['NOT_REQUIRED', 'PENDING', 'READY', 'FAILED']);
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

/** A wish, in code points (D5). Mirrored by `ContentItem_text_length`. */
export const TEXT_MAX_CHARS = 5000;
/** A guest's optional name [O4]. Mirrored by `GuestSession_name_length`, `ContentItem_name_length`. */
export const GUEST_NAME_MAX_CHARS = 80;

export { codePointLength } from './text.js';

const codePoints = (max: number) => (value: string) => {
  const length = codePointLength(value);
  return length >= 1 && length <= max;
};

/** Plain text with line breaks and tabs kept, rendered escaped. */
export const textBodySchema = z
  .string()
  .trim()
  .refine(codePoints(TEXT_MAX_CHARS), {
    message: `Must be 1 to ${TEXT_MAX_CHARS} characters`,
  })
  .regex(NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS, 'Must not contain control characters');

/** One line; the admin sees it per frame, other guests never do (D6). */
export const guestNameSchema = z
  .string()
  .trim()
  .refine(codePoints(GUEST_NAME_MAX_CHARS), {
    message: `Must be 1 to ${GUEST_NAME_MAX_CHARS} characters`,
  })
  .regex(NO_CONTROL_CHARACTERS, 'Must not contain control characters or line breaks');

const nullableInt = z.number().int().min(0).nullable();

/** Media URLs are short-lived presigned links; `null` until the media exists. */
const mediaUrls = {
  thumbnailUrl: z.url().nullable(),
  previewUrl: z.url().nullable(),
  posterUrl: z.url().nullable(),
};

/** A frame as the collection's owner sees it: every number, the contributor's name. */
export const adminContentItemSchema = z
  .object({
    id: z.uuid(),
    frameNo: z.number().int().min(1),
    kind: contentKindSchema,
    createdAt: z.iso.datetime(),
    contributorName: z.string().nullable(),
    originalFilename: z.string().nullable(),
    mimeType: z.string().nullable(),
    sizeBytes: nullableInt,
    width: nullableInt,
    height: nullableInt,
    durationMs: nullableInt,
    processingStatus: processingStatusSchema,
    text: z.string().nullable(),
    ...mediaUrls,
    /** Hidden from guests (by whom, why) and the open reports the admin has not dismissed. */
    moderation: contentModerationSchema,
  })
  .strict();
export type AdminContentItem = z.infer<typeof adminContentItemSchema>;

/**
 * `GET /api/v1/content/:id`: the item plus links to the original (view and download), and its
 * open reports the admin has not dismissed, oldest first (never the reporter's contact, R2).
 */
export const adminContentDetailSchema = adminContentItemSchema
  .extend({
    originalUrl: z.url().nullable(),
    downloadUrl: z.url().nullable(),
    reports: z.array(adminReportSchema),
  })
  .strict();
export type AdminContentDetail = z.infer<typeof adminContentDetailSchema>;

const guestContentItemShape = z.object({
  id: z.uuid(),
  kind: contentKindSchema,
  createdAt: z.iso.datetime(),
  isOwn: z.boolean(),
  /** Only on the guest's own frames (ADR 0015): other guests' numbers stay private. */
  frameNo: z.number().int().min(1).nullable(),
  canDelete: z.boolean(),
  /** Only on the guest's own files: other guests' metadata stays private (spec §8). */
  originalFilename: z.string().nullable(),
  sizeBytes: nullableInt,
  width: nullableInt,
  height: nullableInt,
  durationMs: nullableInt,
  processingStatus: processingStatusSchema,
  text: z.string().nullable(),
  ...mediaUrls,
});

const frameNoOnlyWhenOwn = (item: { isOwn: boolean; frameNo: number | null }) =>
  (item.frameNo !== null) === item.isOwn;
const frameNoRule = { message: 'frameNo is set exactly on own items', path: ['frameNo'] };
const filenameOnlyWhenOwn = (item: { isOwn: boolean; originalFilename: string | null }) =>
  item.isOwn || item.originalFilename === null;
const filenameRule = {
  message: 'originalFilename is only on own items',
  path: ['originalFilename'],
};

/**
 * A frame as a guest sees it [C16]: never the contributor's name, session or anything the admin
 * alone sees; numbers and file names only on the guest's own frames.
 */
export const guestContentItemSchema = guestContentItemShape
  .strict()
  .refine(frameNoOnlyWhenOwn, frameNoRule)
  .refine(filenameOnlyWhenOwn, filenameRule);
export type GuestContentItem = z.infer<typeof guestContentItemSchema>;

export const guestContentDetailSchema = guestContentItemShape
  .extend({ originalUrl: z.url().nullable(), downloadUrl: z.url().nullable() })
  .strict()
  .refine(frameNoOnlyWhenOwn, frameNoRule)
  .refine(filenameOnlyWhenOwn, filenameRule);
export type GuestContentDetail = z.infer<typeof guestContentDetailSchema>;

/** A cursor page of frames. */
export const contentPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() }).strict();

export const adminContentPageSchema = contentPageSchema(adminContentItemSchema);
export type AdminContentPage = z.infer<typeof adminContentPageSchema>;
export const guestContentPageSchema = contentPageSchema(guestContentItemSchema);
export type GuestContentPage = z.infer<typeof guestContentPageSchema>;

/**
 * The admin's order [C5]: `newest` first (default) or by frame number, ascending (`frame`). A
 * cursor is valid only with the sort that issued it.
 */
export const adminContentSortSchema = z.enum(['newest', 'frame']);
export type AdminContentSort = z.infer<typeof adminContentSortSchema>;

const cursor = z.string().min(1).max(200).optional();
const limit = z.coerce.number().int().min(1).max(100).default(48);

/**
 * The admin's state filter (slice 9 F1): `ACTIVE` = not hidden and no open report the admin has
 * not dismissed; the two hides by who hid; `REPORTED` = open reports. Several states are OR
 * (`?state=ACTIVE&state=REPORTED`, which Express hands over as an array; one is a string), and
 * the whole is ANDed with `kind`. The service dedupes.
 */
export const contentStateSchema = z.enum(['ACTIVE', 'HIDDEN_ADMIN', 'HIDDEN_OPERATOR', 'REPORTED']);
export type ContentState = z.infer<typeof contentStateSchema>;
export const contentStatesSchema = z.union([
  contentStateSchema,
  z.array(contentStateSchema).min(1).max(4),
]);

/** `GET /api/v1/collections/:id/content`. */
export const adminContentListQuerySchema = z
  .object({
    kind: contentKindSchema.optional(),
    sort: adminContentSortSchema.default('newest'),
    state: contentStatesSchema.optional(),
    cursor,
    limit,
  })
  .strict();
export type AdminContentListQuery = z.infer<typeof adminContentListQuerySchema>;

/** `GET /api/v1/guest/collections/:collectionId/content`: always newest first [C5]. */
export const guestContentListQuerySchema = z
  .object({ scope: z.enum(['own', 'all']), cursor, limit })
  .strict();
export type GuestContentListQuery = z.infer<typeof guestContentListQuerySchema>;

const count = z.number().int().min(0);

/** `GET /api/v1/collections/:id/content/counts`: non-deleted frames by kind. */
export const contentCountsSchema = z
  .object({
    total: count,
    photo: count,
    video: count,
    document: count,
    text: count,
    lastAddedAt: z.iso.datetime().nullable(),
    /**
     * By state (slice 9 F1), per collection like the kinds, not per the current kind filter:
     * `active` + `hiddenByAdmin` + `hiddenByOperator` + (reported and not hidden) = `total`.
     */
    active: count,
    hiddenByAdmin: count,
    hiddenByOperator: count,
    /** Non-deleted frames with open reports the admin has not dismissed (hidden ones included). */
    reported: count,
  })
  .strict();
export type ContentCounts = z.infer<typeof contentCountsSchema>;

/** `POST /api/v1/collections/:id/content/bulk-delete` [C7]. */
export const bulkDeleteContentRequestSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(100) })
  .strict()
  // UUIDs are case-insensitive: `A…` and `a…` are one frame.
  .refine((body) => new Set(body.ids.map((id) => id.toLowerCase())).size === body.ids.length, {
    message: 'Ids must be unique',
    path: ['ids'],
  });
export type BulkDeleteContentRequest = z.infer<typeof bulkDeleteContentRequestSchema>;

/**
 * What happened to each id: `deleted` by this request, `alreadyDeleted` before it (a retry moves
 * ids here, the frames are gone either way), `notFound` (no such frame in this collection; a
 * frame of another collection is reported the same way). Every requested id is in exactly one.
 */
export const bulkDeleteContentResponseSchema = z
  .object({
    deleted: z.array(z.uuid()),
    alreadyDeleted: z.array(z.uuid()),
    notFound: z.array(z.uuid()),
  })
  .strict();
export type BulkDeleteContentResponse = z.infer<typeof bulkDeleteContentResponseSchema>;

export const contentIdParamsSchema = z.object({ id: z.uuid() });

/** `POST /api/v1/guest/collections/:collectionId/texts`. */
export const createTextRequestSchema = z.object({ body: textBodySchema }).strict();
export type CreateTextRequest = z.infer<typeof createTextRequestSchema>;

/** The `Idempotency-Key` header: one UUID per draft, kept across retries. */
export const idempotencyKeyHeaderSchema = z.uuid();
