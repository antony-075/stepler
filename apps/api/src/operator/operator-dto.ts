import type { OperatorItemState, OperatorReportDetail } from '@stepler/contracts';
import type { ContentReport } from '../generated/prisma/client.js';

/** A frame's state in the queue: deleted wins over hidden. */
export function itemState(row: {
  deletedAt: Date | null;
  hiddenAt: Date | null;
}): OperatorItemState {
  if (row.deletedAt !== null) return 'DELETED';
  return row.hiddenAt === null ? 'VISIBLE' : 'HIDDEN';
}

type ReportFields = OperatorReportDetail['otherReports'][number];

/** A report as the operator sees it: never the reporter's address or session (R5). */
export function toOperatorReportFields(row: ContentReport): ReportFields {
  return {
    id: row.id,
    reason: row.reason,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    adminDismissedAt: row.adminDismissedAt?.toISOString() ?? null,
  };
}

/** The main report of the detail: whether a contact was left, and the decision. */
export function toOperatorReport(row: ContentReport): OperatorReportDetail['report'] {
  return {
    ...toOperatorReportFields(row),
    hasReporterContact: row.reporterEmail !== null,
    resolution:
      row.status === 'OPEN' || row.resolvedAt === null || row.resolutionNote === null
        ? null
        : { status: row.status, note: row.resolutionNote, at: row.resolvedAt.toISOString() },
  };
}
