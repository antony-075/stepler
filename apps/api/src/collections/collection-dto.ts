import type { Collection } from '@stepler/contracts';
import { AppError } from '../errors/app-error.js';
import type {
  Collection as CollectionRow,
  GuestLink as GuestLinkRow,
  Prisma,
} from '../generated/prisma/client.js';

/**
 * Reads include the live default link's status and permissions, in the same query (no N+1): the
 * dashboard shows what guests may add per collection.
 */
export const WITH_DEFAULT_LINK = {
  guestLinks: {
    where: { isDefault: true, status: { not: 'REVOKED' } },
    select: {
      status: true,
      canUploadPhotos: true,
      canUploadVideos: true,
      canUploadDocuments: true,
      canSubmitText: true,
      canViewGallery: true,
      canDeleteOwn: true,
    },
    take: 1,
  },
} satisfies Prisma.CollectionInclude;

type DefaultLinkFields = Pick<
  GuestLinkRow,
  | 'status'
  | 'canUploadPhotos'
  | 'canUploadVideos'
  | 'canUploadDocuments'
  | 'canSubmitText'
  | 'canViewGallery'
  | 'canDeleteOwn'
>;

export type CollectionWithDefaultLink = CollectionRow & { guestLinks: DefaultLinkFields[] };

/** Non-deleted frames of a collection; read for a whole page in one grouped query. */
export interface ContentStats {
  count: number;
  lastAt: Date | null;
}

export const NO_CONTENT: ContentStats = { count: 0, lastAt: null };

/** Explicit mapping: `ownerId` and `deletionRequestedAt` never reach the API. */
export function toCollectionDto(
  row: CollectionWithDefaultLink,
  content: ContentStats = NO_CONTENT,
): Collection {
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
    ...defaultLink(row.guestLinks[0]),
    contentCount: content.count,
    lastContentAt: content.lastAt?.toISOString() ?? null,
  };
}

/** Both `null` for a collection from before guest links that has not been given its default yet. */
function defaultLink(
  link: DefaultLinkFields | undefined,
): Pick<Collection, 'defaultLinkStatus' | 'defaultLinkPermissions'> {
  // The include filters out REVOKED; treating one as "no live default" keeps the mapping total.
  if (link === undefined || link.status === 'REVOKED') {
    return { defaultLinkStatus: null, defaultLinkPermissions: null };
  }
  return {
    defaultLinkStatus: link.status,
    defaultLinkPermissions: {
      canUploadPhotos: link.canUploadPhotos,
      canUploadVideos: link.canUploadVideos,
      canUploadDocuments: link.canUploadDocuments,
      canSubmitText: link.canSubmitText,
      canViewGallery: link.canViewGallery,
      canDeleteOwn: link.canDeleteOwn,
    },
  };
}
