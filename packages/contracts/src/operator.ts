import { z } from 'zod';
import { contentKindSchema } from './content.js';
import {
  contentHiddenSchema,
  moderationTextSchema,
  reportReasonSchema,
  reportStatusSchema,
} from './reports.js';

/**
 * The Stepler operator console's API (`/api/v1/operator/*`, R4–R5). Its own contracts file, so
 * the console can move to its own app with its routes (plan "Console architecture"). The
 * operator sees reported items with minimal context, never whole collections, and never a
 * reporter's contact (only whether one was left).
 */

/** `GET /api/v1/operator/session`: the signed-in service account. */
export const operatorSessionSchema = z.object({ email: z.email() }).strict();
export type OperatorSession = z.infer<typeof operatorSessionSchema>;

/** `GET /api/v1/operator/reports`: one status at a time, newest first, cursor-paginated. */
export const operatorReportListQuerySchema = z
  .object({
    status: reportStatusSchema.default('OPEN'),
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type OperatorReportListQuery = z.infer<typeof operatorReportListQuerySchema>;

/** A reported item's state as the operator sees it. */
export const operatorItemStateSchema = z.enum(['VISIBLE', 'HIDDEN', 'DELETED']);
export type OperatorItemState = z.infer<typeof operatorItemStateSchema>;

const frameNo = z.number().int().min(1);
const count = z.number().int().min(0);

/** A queue row: no description, owner or actions (those are on the detail page). */
export const operatorReportRowSchema = z
  .object({
    id: z.uuid(),
    reason: reportReasonSchema,
    status: reportStatusSchema,
    createdAt: z.iso.datetime(),
    /** `null` once the item was purged (the report outlives it, spec §7.4). */
    content: z
      .object({
        id: z.uuid(),
        kind: contentKindSchema,
        frameNo,
        state: operatorItemStateSchema,
      })
      .strict()
      .nullable(),
    /** `null` once the collection was purged. */
    collection: z.object({ id: z.uuid(), title: z.string() }).strict().nullable(),
    /** Open reports on the same item, this one included when open. */
    openReportsOnItem: count,
  })
  .strict();
export type OperatorReportRow = z.infer<typeof operatorReportRowSchema>;

export const operatorReportPageSchema = z
  .object({ items: z.array(operatorReportRowSchema), nextCursor: z.string().nullable() })
  .strict();
export type OperatorReportPage = z.infer<typeof operatorReportPageSchema>;

const resolutionSchema = z
  .object({
    status: z.enum(['DISMISSED', 'ACTIONED']),
    note: z.string(),
    at: z.iso.datetime(),
  })
  .strict();

const reportFields = {
  id: z.uuid(),
  reason: reportReasonSchema,
  description: z.string().nullable(),
  status: reportStatusSchema,
  createdAt: z.iso.datetime(),
  /** The collection admin dismissed it for themselves ([Q1]); still open for the operator. */
  adminDismissedAt: z.iso.datetime().nullable(),
};

/** `GET /api/v1/operator/reports/:id`. */
export const operatorReportDetailSchema = z
  .object({
    report: z
      .object({
        ...reportFields,
        /** Whether the reporter left an e-mail for the decision; never the address. */
        hasReporterContact: z.boolean(),
        resolution: resolutionSchema.nullable(),
      })
      .strict(),
    /** Every other report on the same item, newest first. */
    otherReports: z.array(z.object(reportFields).strict()),
    content: z
      .object({
        id: z.uuid(),
        kind: contentKindSchema,
        frameNo,
        createdAt: z.iso.datetime(),
        hidden: contentHiddenSchema.nullable(),
        deleted: z.boolean(),
        text: z.string().nullable(),
        media: z
          .object({
            thumbnailUrl: z.url().nullable(),
            previewUrl: z.url().nullable(),
            posterUrl: z.url().nullable(),
          })
          .strict()
          .nullable(),
        originalUrl: z.url().nullable(),
      })
      .strict()
      .nullable(),
    collection: z
      .object({
        id: z.uuid(),
        title: z.string(),
        status: z.enum(['ACTIVE', 'ARCHIVED', 'DELETING']),
        blocked: z.object({ at: z.iso.datetime(), reason: z.string() }).strict().nullable(),
      })
      .strict()
      .nullable(),
    owner: z
      .object({
        id: z.uuid(),
        email: z.email(),
        status: z.enum(['ACTIVE', 'BLOCKED']),
        blockedReason: z.string().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type OperatorReportDetail = z.infer<typeof operatorReportDetailSchema>;

/** `PATCH /api/v1/operator/reports/:id`: decides every open report on the same item ([P2]). */
export const resolveReportRequestSchema = z
  .object({ status: z.enum(['DISMISSED', 'ACTIONED']), note: moderationTextSchema })
  .strict();
export type ResolveReportRequest = z.infer<typeof resolveReportRequestSchema>;

/** Every operator action on content, a collection or an account: a reason, audited. */
export const operatorActionRequestSchema = z.object({ reason: moderationTextSchema }).strict();
export type OperatorActionRequest = z.infer<typeof operatorActionRequestSchema>;

export const operatorReportIdParamsSchema = z.object({ id: z.uuid() });
