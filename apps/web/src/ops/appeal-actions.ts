import type { OperatorAppealDetail } from '@stepler/contracts';

export type AppealAction = 'uphold' | 'reject';

/** Both decisions while the appeal is open; none once decided (the decision is final here). */
export function availableAppealActions(
  detail: Pick<OperatorAppealDetail, 'appeal'>,
): AppealAction[] {
  return detail.appeal.status === 'OPEN' ? ['uphold', 'reject'] : [];
}
