import type { Prisma } from '../generated/prisma/client.js';

/**
 * What guests may see of a collection's frames (slice 9, [P6]): not deleted and not hidden by the
 * admin or the operator. Every guest content read spreads it, so a hidden frame is absent from
 * lists, counts, details and replays alike; the admin's reads do not (the admin sees hidden
 * frames). Served by the partial `ContentItem_guest_feed_idx` and `ContentItem_own_idx`.
 */
export const GUEST_VISIBLE = {
  deletedAt: null,
  hiddenAt: null,
  // Slice 9b: deleted by the operator, kept only for its admin and the appeal.
  quarantinedAt: null,
} as const satisfies Prisma.ContentItemWhereInput;
