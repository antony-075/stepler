import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type {
  CollectionStatus,
  GuestLink as GuestLinkRow,
  GuestLinkStatus,
  UserStatus,
} from '../generated/prisma/client.js';
import { GuestLinkTokens } from './guest-link-tokens.js';

export interface ResolvedGuestLink {
  link: GuestLinkRow;
  collection: { id: string; title: string; description: string | null };
}

/** The states that decide whether a guest may use a link right now. */
export interface LinkState {
  link: { status: GuestLinkStatus };
  collection: { status: CollectionStatus; owner: { status: UserStatus } };
}

/**
 * [G5] order, so the most permanent state wins:
 * collection gone or owner blocked → 410; link revoked → 410; collection archived → 403;
 * link paused → 403. Shared by link resolution and every guest-session request.
 */
export function assertLinkUsable({ link, collection }: LinkState): void {
  if (collection.status === 'DELETING' || collection.owner.status === 'BLOCKED') {
    throw new AppError('COLLECTION_UNAVAILABLE', 410);
  }
  if (link.status === 'REVOKED') throw new AppError('LINK_REVOKED', 410);
  if (collection.status === 'ARCHIVED') throw new AppError('COLLECTION_ARCHIVED', 403);
  if (link.status === 'INACTIVE') throw new AppError('LINK_INACTIVE', 403);
}

/**
 * The public side of guest links: a raw token to a live link, or the error for its state.
 * Reads the row on every call (no caching), so pausing, revoking or a permission change takes
 * effect on the guest's next request. The guest session exchange reuses it.
 */
@Injectable()
export class GuestLinkResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: GuestLinkTokens,
  ) {}

  /** Unknown → 404, then the [G5] states of `assertLinkUsable`. */
  async resolveActive(rawToken: string): Promise<ResolvedGuestLink> {
    const tokenHash = this.tokens.hashForLookup(rawToken);
    const row =
      tokenHash === null
        ? null
        : await this.prisma.guestLink.findUnique({
            where: { tokenHash },
            include: {
              collection: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  status: true,
                  owner: { select: { status: true } },
                },
              },
            },
          });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    const { collection, ...link } = row;
    assertLinkUsable({ link, collection });
    return {
      link,
      collection: {
        id: collection.id,
        title: collection.title,
        description: collection.description,
      },
    };
  }
}
