/**
 * The one status a collection shows (owner remark S1, 2026-10-06): the user app and the ops
 * console both derive it here, so a blocked collection never reads «Активна» anywhere. Precedence:
 * a block by the Stepler operator over everything (it is an alert), then deletion, the archive,
 * and only then «Активна».
 */
export const COLLECTION_DISPLAY_STATUSES = ['BLOCKED', 'DELETING', 'ARCHIVED', 'ACTIVE'] as const;
export type CollectionDisplayStatus = (typeof COLLECTION_DISPLAY_STATUSES)[number];

/** What the API says about a collection's state: its status and whether the operator blocked it. */
export interface CollectionStateSource {
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETING';
  /** `null` when not blocked; anything else (the `{ at, reason }` object) means blocked. */
  blocked: unknown;
}

export function collectionDisplayStatus(source: CollectionStateSource): CollectionDisplayStatus {
  if (source.blocked !== null && source.blocked !== undefined) return 'BLOCKED';
  return source.status;
}

/** Whether guests can get in at all, before the main link's own state is looked at. */
export function collectionClosedToGuests(source: CollectionStateSource): boolean {
  return collectionDisplayStatus(source) !== 'ACTIVE';
}
