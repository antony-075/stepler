import type { OperatorItemState, ReportStatus } from '@stepler/contracts';

/** `?status=` in the console's URL ↔ the API's status; anything unknown is the «Нові» tab. */
const PARAMS: Record<string, ReportStatus> = {
  open: 'OPEN',
  actioned: 'ACTIONED',
  dismissed: 'DISMISSED',
};

export const REPORT_TABS = ['OPEN', 'ACTIONED', 'DISMISSED'] as const satisfies ReportStatus[];

export function statusFromParam(value: string | null | undefined): ReportStatus {
  return (value === null || value === undefined ? undefined : PARAMS[value]) ?? 'OPEN';
}

export function paramOfStatus(status: ReportStatus): string {
  return status.toLowerCase();
}

/** The queue's state badge: what a guest sees of the frame now. */
export const STATE_BADGE: Record<OperatorItemState, 'neutral' | 'warning' | 'danger'> = {
  VISIBLE: 'neutral',
  HIDDEN: 'warning',
  DELETED: 'danger',
};
