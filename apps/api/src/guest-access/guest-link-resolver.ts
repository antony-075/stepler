import { Injectable } from '@nestjs/common';
import type { GuestLinkThemeResponse } from '@stepler/contracts';
import { resolveTheme } from '@stepler/templates/core';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type {
  CollectionStatus,
  GuestLink as GuestLinkRow,
  GuestLinkStatus,
  UserStatus,
} from '../generated/prisma/client.js';
import { CONTEXT_COLLECTION, type ContextCollection } from './guest-context-select.js';
import { GuestLinkTokens } from './guest-link-tokens.js';

export interface ResolvedGuestLink {
  link: GuestLinkRow;
  /** What the guest context needs: the published guest page, never the draft. */
  collection: ContextCollection;
}

/** The states that decide whether a guest may use a link right now. */
export interface LinkState {
  link: { status: GuestLinkStatus };
  collection: { status: CollectionStatus; blockedAt: Date | null; owner: { status: UserStatus } };
}

/**
 * [G5] order, so the most permanent state wins:
 * collection gone, blocked by the operator or its owner blocked or deleted → 410 (slice 9 [P6]: the one
 * place every guest route passes through); link revoked → 410; collection archived → 403;
 * link paused → 403. Shared by link resolution and every guest-session request.
 */
export function assertLinkUsable({ link, collection }: LinkState): void {
  if (
    collection.status === 'DELETING' ||
    collection.blockedAt !== null ||
    // BLOCKED, or DELETED (ADR 0020): its collections are DELETING by then; this holds anyway.
    collection.owner.status !== 'ACTIVE'
  ) {
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

  /**
   * The published page's look for a link in any state (live, paused, revoked, its collection
   * archived): the guest page draws its loading and state screens in it (owner remarks 99, 100).
   * Unknown token, or the collection gone (deleting, blocked, owner blocked) → 404. Never the
   * title.
   */
  async themeOf(rawToken: string): Promise<GuestLinkThemeResponse> {
    const tokenHash = this.tokens.hashForLookup(rawToken);
    const row =
      tokenHash === null
        ? null
        : await this.prisma.guestLink.findUnique({
            where: { tokenHash },
            select: {
              collection: {
                select: {
                  status: true,
                  blockedAt: true,
                  owner: { select: { status: true } },
                  guestPageVersions: {
                    where: { state: 'PUBLISHED' },
                    select: { templateId: true, templateVersion: true, settings: true },
                    take: 1,
                  },
                },
              },
            },
          });
    if (
      row === null ||
      row.collection.status === 'DELETING' ||
      row.collection.blockedAt !== null ||
      row.collection.owner.status !== 'ACTIVE'
    ) {
      throw new AppError('NOT_FOUND', 404);
    }
    const published = row.collection.guestPageVersions[0];
    // As the guest context reads it: a removed template or stale settings are the defaults.
    const { def, settings } = resolveTheme(
      published?.templateId ?? '',
      published?.templateVersion ?? 1,
      published?.settings,
    );
    return { templateId: def.id, templateVersion: def.version, settings };
  }

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
                  ...CONTEXT_COLLECTION,
                  status: true,
                  blockedAt: true,
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
        guestPageVersions: collection.guestPageVersions,
      },
    };
  }
}
