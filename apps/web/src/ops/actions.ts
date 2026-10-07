import type { OperatorReportDetail } from '@stepler/contracts';

export type OpsAction =
  | 'hide'
  | 'unhide'
  | 'quarantine'
  | 'restore'
  | 'dismiss'
  | 'action'
  | 'blockCollection'
  | 'unblockCollection'
  | 'blockAccount'
  | 'unblockAccount'
  // Slice 9b: the decisions on an admin's appeal (the appeal detail's two actions).
  | 'uphold'
  | 'reject';

/** The groups the detail page shows its actions in, in this order. */
export const ACTION_GROUPS = {
  content: ['hide', 'unhide', 'quarantine', 'restore'],
  report: ['action', 'dismiss'],
  collection: ['blockCollection', 'unblockCollection'],
  account: ['blockAccount', 'unblockAccount'],
} as const satisfies Record<string, readonly OpsAction[]>;

/** The appeal decisions write a note the admin reads, not a reason; on «Задовольнити» it is optional. */
export const NOTE_ACTIONS: ReadonlySet<OpsAction> = new Set(['uphold', 'reject']);
export const OPTIONAL_NOTE: ReadonlySet<OpsAction> = new Set(['uphold']);

/** Destructive actions get the destructive confirm button. */
export const DESTRUCTIVE: ReadonlySet<OpsAction> = new Set([
  'quarantine',
  'blockCollection',
  'blockAccount',
]);

/**
 * What the operator may do on this report now: nothing on what is gone (a purged frame or
 * collection), each block paired with its unblock, a decision only while the report is open. A
 * quarantined frame (slice 9b: the operator's deletion) can only be restored.
 */
export function availableActions(detail: OperatorReportDetail): OpsAction[] {
  const actions: OpsAction[] = [];
  const { content, collection, owner, report } = detail;
  if (content !== null && !content.deleted) {
    if (content.quarantined !== null) {
      actions.push('restore');
    } else {
      if (content.hidden?.by !== 'OPERATOR') actions.push('hide');
      if (content.hidden !== null) actions.push('unhide');
      actions.push('quarantine');
    }
  }
  if (report.status === 'OPEN') actions.push('dismiss', 'action');
  if (collection !== null) {
    actions.push(collection.blocked === null ? 'blockCollection' : 'unblockCollection');
  }
  if (owner !== null) actions.push(owner.status === 'ACTIVE' ? 'blockAccount' : 'unblockAccount');
  return actions;
}
