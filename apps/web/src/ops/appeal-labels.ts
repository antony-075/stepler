import type { AppealStatus, OperatorAppealMeasure } from '@stepler/contracts';

/** `?status=` of the appeal queue ↔ the API's status; anything unknown is the «Нові» tab. */
const PARAMS: Record<string, AppealStatus> = {
  open: 'OPEN',
  upheld: 'UPHELD',
  rejected: 'REJECTED',
};

export const APPEAL_TABS = ['OPEN', 'UPHELD', 'REJECTED'] as const satisfies AppealStatus[];

export function appealStatusFromParam(value: string | null | undefined): AppealStatus {
  return (value === null || value === undefined ? undefined : PARAMS[value]) ?? 'OPEN';
}

export function paramOfAppealStatus(status: AppealStatus): string {
  return status.toLowerCase();
}

/** The measure an appeal is against, as it stands now: its badge colour (words carry it too). */
export const MEASURE_BADGE: Record<OperatorAppealMeasure, 'neutral' | 'warning' | 'danger'> = {
  HIDDEN: 'warning',
  QUARANTINED: 'warning',
  BLOCKED: 'danger',
  NONE: 'neutral',
};

/** The appeal's own status badge. */
export const APPEAL_STATUS_BADGE: Record<AppealStatus, 'info' | 'success' | 'neutral'> = {
  OPEN: 'info',
  UPHELD: 'success',
  REJECTED: 'neutral',
};
