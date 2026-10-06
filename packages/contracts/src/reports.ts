import { z } from 'zod';
import { localeSchema } from './auth.js';
import { codePointLength, NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS } from './text.js';

/**
 * Content reports and moderation (slice 9, ADR 0013). A guest reports another guest's frame; the
 * collection admin sees the reports in the app (never the reporter's contact, R2); the Stepler
 * operator decides (R5).
 */

/** Why a frame is reported (R1). Mirrored by the `ReportReason` enum. */
export const REPORT_REASONS = ['ILLEGAL', 'INAPPROPRIATE', 'PRIVACY', 'SPAM', 'OTHER'] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof reportReasonSchema>;

/** A reporter's optional description, in code points. Mirrored by `ContentReport_description_length`. */
export const REPORT_DESCRIPTION_MAX_CHARS = 1000;
/**
 * The operator's reasons and notes, in code points. Mirrored by `ContentItem_hidden_reason_length`,
 * `Collection_blocked_reason_length` and `ContentReport_note_length`.
 */
export const MODERATION_TEXT_MAX_CHARS = 500;

/** `OPEN` until the operator decides; `ACTIONED` / `DISMISSED` close it for everyone ([P2]). */
export const reportStatusSchema = z.enum(['OPEN', 'DISMISSED', 'ACTIONED']);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .refine(
      (value) => {
        const length = codePointLength(value);
        return length >= 1 && length <= max;
      },
      { message: `Must be 1 to ${max} characters` },
    )
    .regex(
      NO_CONTROL_CHARACTERS_EXCEPT_LINE_BREAKS_AND_TABS,
      'Must not contain control characters',
    );

/** `POST /api/v1/guest/collections/:collectionId/content/:id/reports` (R1). */
export const createReportRequestSchema = z
  .object({
    reason: reportReasonSchema,
    description: plainText(REPORT_DESCRIPTION_MAX_CHARS).optional(),
    /** Only to send the decision; kept until then, 90 days at most ([Q6]). */
    email: z.email().max(254).optional(),
    /** The reporter's interface language, for the decision e-mail [P7]. */
    locale: localeSchema,
  })
  .strict();
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;

export const createReportResponseSchema = z.object({ id: z.uuid() }).strict();
export type CreateReportResponse = z.infer<typeof createReportResponseSchema>;

/** An operator's reason for an action, or the note of a decision: required, one place for the rule. */
export const moderationTextSchema = plainText(MODERATION_TEXT_MAX_CHARS);

/** A report as the collection admin sees it: never who reported it or their contact (R2). */
export const adminReportSchema = z
  .object({
    id: z.uuid(),
    reason: reportReasonSchema,
    description: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type AdminReport = z.infer<typeof adminReportSchema>;

/** Who hid a frame from guests: its admin, or the Stepler operator (whom the admin cannot undo). */
export const hiddenBySchema = z.enum(['ADMIN', 'OPERATOR']);
export type HiddenBy = z.infer<typeof hiddenBySchema>;

/** `reason` is the operator's (an admin hides without one). */
export const contentHiddenSchema = z
  .object({ by: hiddenBySchema, at: z.iso.datetime(), reason: z.string().nullable() })
  .strict();
export type ContentHidden = z.infer<typeof contentHiddenSchema>;

/** A frame's moderation state for its admin: hidden or not, and open reports not dismissed. */
export const contentModerationSchema = z
  .object({
    hidden: contentHiddenSchema.nullable(),
    openReports: z.number().int().min(0),
  })
  .strict();
export type ContentModeration = z.infer<typeof contentModerationSchema>;
