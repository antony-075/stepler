import type { Collection } from '@stepler/contracts';
import { AppError } from '../errors/app-error.js';
import type {
  Collection as CollectionRow,
  GuestLinkStatus,
  Prisma,
} from '../generated/prisma/client.js';

/** Reads include the live default link's status, in the same query (no N+1). */
export const WITH_DEFAULT_LINK_STATUS = {
  guestLinks: {
    where: { isDefault: true, status: { not: 'REVOKED' } },
    select: { status: true },
    take: 1,
  },
} satisfies Prisma.CollectionInclude;

export type CollectionWithDefaultLink = CollectionRow & {
  guestLinks: { status: GuestLinkStatus }[];
};

/** Explicit mapping: `ownerId` and `deletionRequestedAt` never reach the API. */
export function toCollectionDto(row: CollectionWithDefaultLink): Collection {
  // Owner-scoped queries exclude DELETING rows; reaching here with one is a bug.
  if (row.status === 'DELETING') throw new AppError('NOT_FOUND', 404);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    defaultLinkStatus: defaultLinkStatus(row.guestLinks[0]?.status),
  };
}

/** `null` for a collection from before guest links that has not been given its default yet. */
function defaultLinkStatus(status: GuestLinkStatus | undefined): Collection['defaultLinkStatus'] {
  // The include filters out REVOKED; treating one as "no live default" keeps the mapping total.
  return status === undefined || status === 'REVOKED' ? null : status;
}
