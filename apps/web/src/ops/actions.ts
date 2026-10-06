import type { OperatorReportDetail } from '@stepler/contracts';

export type OpsAction =
  | 'hide'
  | 'unhide'
  | 'delete'
  | 'dismiss'
  | 'action'
  | 'blockCollection'
  | 'unblockCollection'
  | 'blockAccount'
  | 'unblockAccount';

/** The groups the detail page shows its actions in, in this order. */
export const ACTION_GROUPS = {
  content: ['hide', 'unhide', 'delete'],
  report: ['action', 'dismiss'],
  collection: ['blockCollection', 'unblockCollection'],
  account: ['blockAccount', 'unblockAccount'],
} as const satisfies Record<string, readonly OpsAction[]>;

/** Destructive actions get the destructive confirm button. */
export const DESTRUCTIVE: ReadonlySet<OpsAction> = new Set([
  'delete',
  'blockCollection',
  'blockAccount',
]);

/**
 * What the operator may do on this report now: nothing on what is gone (a purged frame or
 * collection), each block paired with its unblock, a decision only while the report is open.
 */
export function availableActions(detail: OperatorReportDetail): OpsAction[] {
  const actions: OpsAction[] = [];
  const { content, collection, owner, report } = detail;
  if (content !== null && !content.deleted) {
    if (content.hidden?.by !== 'OPERATOR') actions.push('hide');
    if (content.hidden !== null) actions.push('unhide');
    actions.push('delete');
  }
  if (report.status === 'OPEN') actions.push('dismiss', 'action');
  if (collection !== null) {
    actions.push(collection.blocked === null ? 'blockCollection' : 'unblockCollection');
  }
  if (owner !== null) actions.push(owner.status === 'ACTIVE' ? 'blockAccount' : 'unblockAccount');
  return actions;
}
