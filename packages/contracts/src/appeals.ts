import { z } from 'zod';
import { codePointLength, NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS } from './text.js';

/**
 * Appeals (slice 9b, ADR 0013 addendum): the collection admin asks the Stepler operator to review
 * a measure on their collection: a frame the operator hid or quarantined, or a blocked collection.
 * The admin never sees who decided; the operator sees the admin's text.
 */

/** The admin's text, in code points. Mirrored by `ModerationAppeal_text_length`. */
export const APPEAL_TEXT_MAX_CHARS = 1000;

export const appealTextSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      const length = codePointLength(value);
      return length >= 1 && length <= APPEAL_TEXT_MAX_CHARS;
    },
    { message: `Must be 1 to ${APPEAL_TEXT_MAX_CHARS} characters` },
  )
  .regex(NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS, 'Must not contain control characters');

/** A frame (hidden or quarantined by the operator) or the blocked collection itself. */
export const appealTargetTypeSchema = z.enum(['CONTENT', 'COLLECTION']);
export type AppealTargetType = z.infer<typeof appealTargetTypeSchema>;

/** `OPEN` until the operator decides; `UPHELD` reverses the measure, `REJECTED` keeps it. */
export const appealStatusSchema = z.enum(['OPEN', 'UPHELD', 'REJECTED']);
export type AppealStatus = z.infer<typeof appealStatusSchema>;

/**
 * `POST /api/v1/collections/:id/content/:itemId/appeals` and
 * `POST /api/v1/collections/:id/appeals`.
 */
export const createAppealRequestSchema = z.object({ text: appealTextSchema }).strict();
export type CreateAppealRequest = z.infer<typeof createAppealRequestSchema>;

/** The operator's decision as the admin sees it: the outcome and the note, never who decided. */
export const appealResolutionSchema = z
  .object({
    status: z.enum(['UPHELD', 'REJECTED']),
    /** Required on a rejection, optional on an upheld appeal. */
    note: z.string().nullable(),
    at: z.iso.datetime(),
  })
  .strict();
export type AppealResolution = z.infer<typeof appealResolutionSchema>;

/** An appeal as its admin sees it. */
export const adminAppealSchema = z
  .object({
    id: z.uuid(),
    targetType: appealTargetTypeSchema,
    targetId: z.uuid(),
    status: appealStatusSchema,
    text: z.string(),
    createdAt: z.iso.datetime(),
    resolution: appealResolutionSchema.nullable(),
  })
  .strict();
export type AdminAppeal = z.infer<typeof adminAppealSchema>;

/** `GET /api/v1/collections/:id/appeals`: the collection's appeals, newest first (≤ 50). */
export const adminAppealListSchema = z.object({ items: z.array(adminAppealSchema) }).strict();
export type AdminAppealList = z.infer<typeof adminAppealListSchema>;

export const collectionContentParamsSchema = z.object({ id: z.uuid(), itemId: z.uuid() });
