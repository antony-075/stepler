import type { Collection } from '@stepler/contracts';
import { AppError } from '../errors/app-error.js';
import type { Collection as CollectionRow } from '../generated/prisma/client.js';

/** Explicit mapping: `ownerId` and `deletionRequestedAt` never reach the API. */
export function toCollectionDto(row: CollectionRow): Collection {
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
    // Filled from the live default guest link once guest links exist (slice 2, Task 4).
    defaultLinkStatus: null,
  };
}
