import { z } from 'zod';
import { appealResolutionSchema, appealStatusSchema, appealTargetTypeSchema } from './appeals.js';
import { contentKindSchema } from './content.js';
import {
  contentHiddenSchema,
  contentQuarantinedSchema,
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

/**
 * A reported item's state as the operator sees it: deleted (by its admin or a guest, or after
 * the quarantine ran out) wins over quarantined (the operator's deletion, slice 9b), which wins
 * over hidden.
 */
export const operatorItemStateSchema = z.enum(['VISIBLE', 'HIDDEN', 'QUARANTINED', 'DELETED']);
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

/** The frame a report or an appeal is about; `null` once purged. */
export const operatorContentSchema = z
  .object({
    id: z.uuid(),
    kind: contentKindSchema,
    frameNo,
    createdAt: z.iso.datetime(),
    hidden: contentHiddenSchema.nullable(),
    /** The operator's deletion, undone by a restore until `purgeAfter` (slice 9b). */
    quarantined: contentQuarantinedSchema.nullable(),
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
    /** `null` for a deleted or quarantined frame: nothing is signed for the original then. */
    originalUrl: z.url().nullable(),
  })
  .strict();
export type OperatorContent = z.infer<typeof operatorContentSchema>;

/** The minimal collection context (R5); `null` once purged. */
export const operatorCollectionSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'DELETING']),
    blocked: z.object({ at: z.iso.datetime(), reason: z.string() }).strict().nullable(),
  })
  .strict();

/** The owner's address and state (R5). */
export const operatorOwnerSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    status: z.enum(['ACTIVE', 'BLOCKED']),
    blockedReason: z.string().nullable(),
  })
  .strict();

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
    content: operatorContentSchema.nullable(),
    collection: operatorCollectionSchema.nullable(),
    owner: operatorOwnerSchema.nullable(),
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

// --- Appeals (slice 9b): the admins' appeals, decided in the console's second queue. ---

/** `GET /api/v1/operator/appeals`: one status at a time, newest first, cursor-paginated. */
export const operatorAppealListQuerySchema = z
  .object({
    status: appealStatusSchema.default('OPEN'),
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type OperatorAppealListQuery = z.infer<typeof operatorAppealListQuerySchema>;

/**
 * What the appeal is against, as it stands now: the operator's hide, the quarantine, the
 * collection block, or nothing any more (`NONE`: already reversed, or the frame is gone).
 */
export const operatorAppealMeasureSchema = z.enum(['HIDDEN', 'QUARANTINED', 'BLOCKED', 'NONE']);
export type OperatorAppealMeasure = z.infer<typeof operatorAppealMeasureSchema>;

/** A queue row: the target and the measure; the text and the actions are on the detail page. */
export const operatorAppealRowSchema = z
  .object({
    id: z.uuid(),
    targetType: appealTargetTypeSchema,
    status: appealStatusSchema,
    createdAt: z.iso.datetime(),
    measure: operatorAppealMeasureSchema,
    /** The frame, for a `CONTENT` appeal; `null` for a collection appeal or once purged. */
    content: z
      .object({
        id: z.uuid(),
        kind: contentKindSchema,
        frameNo,
        state: operatorItemStateSchema,
      })
      .strict()
      .nullable(),
    collection: z.object({ id: z.uuid(), title: z.string() }).strict().nullable(),
  })
  .strict();
export type OperatorAppealRow = z.infer<typeof operatorAppealRowSchema>;

export const operatorAppealPageSchema = z
  .object({ items: z.array(operatorAppealRowSchema), nextCursor: z.string().nullable() })
  .strict();
export type OperatorAppealPage = z.infer<typeof operatorAppealPageSchema>;

const appealFields = {
  id: z.uuid(),
  targetType: appealTargetTypeSchema,
  targetId: z.uuid(),
  status: appealStatusSchema,
  /** The admin's text: the one user-authored text the operator reads here. */
  text: z.string(),
  createdAt: z.iso.datetime(),
  resolution: appealResolutionSchema.nullable(),
};

/** `GET /api/v1/operator/appeals/:id`. */
export const operatorAppealDetailSchema = z
  .object({
    appeal: z.object(appealFields).strict(),
    /** Earlier appeals on the same target, newest first. */
    previousAppeals: z.array(z.object(appealFields).strict()),
    measure: operatorAppealMeasureSchema,
    content: operatorContentSchema.nullable(),
    collection: operatorCollectionSchema.nullable(),
    owner: operatorOwnerSchema.nullable(),
    /** The guest reports on the same frame (links to the report queue); none for a collection. */
    relatedReports: z.array(
      z
        .object({
          id: z.uuid(),
          reason: reportReasonSchema,
          status: reportStatusSchema,
          createdAt: z.iso.datetime(),
        })
        .strict(),
    ),
  })
  .strict();
export type OperatorAppealDetail = z.infer<typeof operatorAppealDetailSchema>;

/**
 * `PATCH /api/v1/operator/appeals/:id`: «Задовольнити» reverses the measure (a note is
 * optional); «Відхилити» keeps it and needs a note the admin will read.
 */
export const resolveAppealRequestSchema = z
  .object({ status: z.enum(['UPHELD', 'REJECTED']), note: moderationTextSchema.optional() })
  .strict()
  .refine((value) => value.status !== 'REJECTED' || value.note !== undefined, {
    path: ['note'],
    message: 'A rejection needs a note',
  });
export type ResolveAppealRequest = z.infer<typeof resolveAppealRequestSchema>;

export const operatorAppealIdParamsSchema = z.object({ id: z.uuid() });
