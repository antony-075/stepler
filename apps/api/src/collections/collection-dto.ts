import type { AdminImage, Collection } from '@stepler/contracts';
import { toAccessDto } from '../billing/access-dto.js';
import type { AccessResult } from '../billing/domain/access.js';
import { type CollectionEntitlementRow, WITH_PACK } from '../billing/entitlement-resolver.js';
import { AppError } from '../errors/app-error.js';
import type {
  Collection as CollectionRow,
  GuestLink as GuestLinkRow,
  Prisma,
} from '../generated/prisma/client.js';
import { IMAGE_SELECT, type ImageRow } from '../images/image-urls.js';

/**
 * Reads include the live default link's status and permissions, the published guest page's
 * welcome and the collection image, in the same query (no N+1): the dashboard shows what guests
 * may add per collection and the collection's mark.
 */
export const WITH_DEFAULT_LINK = {
  ...WITH_PACK,
  guestPageVersions: {
    where: { state: 'PUBLISHED' },
    select: { welcomeMessage: true },
    take: 1,
  },
  image: { select: IMAGE_SELECT },
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

export type CollectionWithDefaultLink = CollectionRow & {
  guestLinks: DefaultLinkFields[];
  /** The published version (one at most). */
  guestPageVersions: { welcomeMessage: string | null }[];
  image: ImageRow | null;
} & CollectionEntitlementRow;

/**
 * Non-deleted frames of a collection and the bytes it holds (`UsageService`'s definition); read
 * for a whole page in one grouped query each.
 */
export interface ContentStats {
  count: number;
  lastAt: Date | null;
  storageBytes: number;
}

export const NO_CONTENT: ContentStats = { count: 0, lastAt: null, storageBytes: 0 };

/** Explicit mapping: `ownerId` and `deletionRequestedAt` never reach the API. */
export function toCollectionDto(
  row: CollectionWithDefaultLink,
  content: ContentStats = NO_CONTENT,
  /** `row.image`, signed. */
  image: AdminImage | null,
  /** Resolved by `EntitlementResolver.forOwnedCollection` (ADR 0018). */
  access: AccessResult,
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
    storageBytes: content.storageBytes,
    // The published guest page's.
    welcomeMessage: row.guestPageVersions[0]?.welcomeMessage ?? null,
    image,
    // The operator's block (R7); the CHECK keeps the two together.
    blocked:
      row.blockedAt === null || row.blockedReason === null
        ? null
        : { at: row.blockedAt.toISOString(), reason: row.blockedReason },
    entitlement: row.entitlement,
    access: toAccessDto(access),
    pack:
      row.entitlement === 'PACK' && row.pack !== null
        ? {
            offerId: row.pack.offerId,
            offerTitle: { uk: row.pack.offer.titleUk, en: row.pack.offer.titleEn },
            storageBytes: Number(row.pack.storageBytes),
            windowEndsAt: row.pack.windowEndsAt.toISOString(),
            retentionEndsAt: row.pack.retentionEndsAt.toISOString(),
          }
        : null,
    deleteAfter: row.deleteAfter?.toISOString() ?? null,
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
