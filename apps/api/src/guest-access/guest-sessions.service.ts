import { Injectable } from '@nestjs/common';
import { canContribute, type GuestContext, TEXT_MAX_CHARS } from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import { generateToken, hashToken, TOKEN_PATTERN } from '../auth/tokens.js';
import { type CoverRow, CoverUrls, WITH_COVER } from '../collections/cover-urls.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { GuestSession as GuestSessionRow } from '../generated/prisma/client.js';
import { LimitsService } from '../limits/limits.service.js';
import { permissionsOf } from './guest-link-dto.js';
import { assertLinkUsable, GuestLinkResolver } from './guest-link-resolver.js';
import { canListAll } from './guest-policy.js';

/** `lastSeenAt` is written at most this often, so reads stay reads. */
const LAST_SEEN_RESOLUTION_MS = 3600_000;

interface ContextCollection {
  id: string;
  title: string;
  description: string | null;
  welcomeMessage: string | null;
  cover: CoverRow | null;
}

/**
 * Guest sessions (ADR 0007, spec §9.1 as amended by [C3]). The cookie's raw token is never
 * stored or logged; only its SHA-256 is. Every request re-reads the session's current link and
 * collection, so pausing, revoking, archiving or deleting takes effect on the next request.
 */
@Injectable()
export class GuestSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: GuestLinkResolver,
    private readonly limits: LimitsService,
    private readonly covers: CoverUrls,
  ) {}

  /**
   * Trades a live link token for a session in `collectionId`. A cookie of a session in this
   * collection is re-bound to the link (F5: permissions follow the link the guest came through),
   * otherwise a new session is created and its raw token returned once as `newToken`.
   */
  async exchange(
    collectionId: string,
    linkToken: string,
    cookieToken: string | undefined,
  ): Promise<{ context: GuestContext; newToken: string | null }> {
    const { link, collection } = await this.resolver.resolveActive(linkToken);
    // Nobody can plant a session cookie for another collection's path.
    if (collection.id !== collectionId) throw new AppError('NOT_FOUND', 404);

    const existing = await this.findByCookie(cookieToken);
    let session: GuestSessionRow;
    let newToken: string | null = null;
    if (existing !== null && existing.collectionId === collectionId) {
      session = await this.prisma.guestSession.update({
        where: { id: existing.id },
        data: { currentLinkId: link.id, lastSeenAt: new Date() },
      });
    } else {
      newToken = generateToken();
      session = await this.prisma.guestSession.create({
        data: { collectionId, currentLinkId: link.id, tokenHash: hashToken(newToken) },
      });
    }
    const principal: GuestPrincipal = {
      kind: 'guest',
      guestSessionId: session.id,
      collectionId,
      link: { id: link.id, permissions: permissionsOf(link) },
    };
    return { context: await this.buildContext(principal, collection, session), newToken };
  }

  /**
   * The guest principal for a request to `collectionId`'s guest routes. A missing or unknown
   * cookie, or one of another collection, is `401 GUEST_SESSION_REQUIRED`; then the link and
   * collection states in [G5] order.
   */
  async authenticate(
    collectionId: string,
    cookieToken: string | undefined,
  ): Promise<GuestPrincipal> {
    const { principal, closed } = await this.identify(collectionId, cookieToken);
    if (closed !== null) throw closed;
    return principal;
  }

  /**
   * Like `authenticate`, but a link or collection that no longer accepts guests is returned as
   * `closed` instead of thrown, for the few routes that must still act on it: an upload's
   * completion records the refusal and discards the bytes, and a cancel still frees them.
   */
  async identify(
    collectionId: string,
    cookieToken: string | undefined,
  ): Promise<{ principal: GuestPrincipal; closed: AppError | null }> {
    const session = await this.findByCookie(cookieToken);
    if (session === null || session.collectionId !== collectionId) {
      throw new AppError('GUEST_SESSION_REQUIRED', 401);
    }
    let closed: AppError | null = null;
    try {
      assertLinkUsable({ link: session.currentLink, collection: session.collection });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      closed = error;
    }
    if (closed === null && Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
      await this.prisma.guestSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }
    return {
      principal: {
        kind: 'guest',
        guestSessionId: session.id,
        collectionId,
        link: { id: session.currentLink.id, permissions: permissionsOf(session.currentLink) },
      },
      closed,
    };
  }

  /**
   * Saves (or, with `null`, skips or clears) the guest's name [O4]; either way the prompt is
   * answered. [C4]: the name on this session's live items follows, in the same transaction, so
   * the admin never sees two names for one guest after a typo fix.
   */
  async updateName(p: GuestPrincipal, name: string | null): Promise<GuestContext> {
    if (!canContribute(p.link.permissions)) throw new AppError('FORBIDDEN', 403);
    await this.prisma.$transaction(async (tx) => {
      await tx.guestSession.update({
        where: { id: p.guestSessionId },
        data: { contributorName: name, nameAnsweredAt: new Date() },
      });
      await tx.contentItem.updateMany({
        where: { contributorGuestSessionId: p.guestSessionId, deletedAt: null },
        data: { contributorName: name },
      });
    });
    return this.context(p);
  }

  async context(p: GuestPrincipal): Promise<GuestContext> {
    const session = await this.prisma.guestSession.findUniqueOrThrow({
      where: { id: p.guestSessionId },
      include: {
        collection: {
          select: { id: true, title: true, description: true, welcomeMessage: true, ...WITH_COVER },
        },
      },
    });
    return this.buildContext(p, session.collection, session);
  }

  private async findByCookie(cookieToken: string | undefined) {
    if (cookieToken === undefined || !TOKEN_PATTERN.test(cookieToken)) return null;
    return this.prisma.guestSession.findUnique({
      where: { tokenHash: hashToken(cookieToken) },
      include: {
        currentLink: true,
        collection: { select: { status: true, owner: { select: { status: true } } } },
      },
    });
  }

  private async buildContext(
    p: GuestPrincipal,
    collection: ContextCollection,
    session: Pick<GuestSessionRow, 'contributorName' | 'nameAnsweredAt'>,
  ): Promise<GuestContext> {
    const rules = this.limits.fileRules();
    return {
      collection: {
        id: collection.id,
        title: collection.title,
        description: collection.description,
        welcomeMessage: collection.welcomeMessage,
        // Only a READY cover, and never its source [A2].
        cover: await this.covers.forGuest(collection.cover),
      },
      permissions: p.link.permissions,
      guest: { name: session.contributorName, nameAnswered: session.nameAnsweredAt !== null },
      limits: {
        maxFileBytes: {
          photo: Number(rules.fileBytes.PHOTO),
          video: Number(rules.fileBytes.VIDEO),
          document: Number(rules.fileBytes.DOCUMENT),
        },
        filesPerBatch: rules.filesPerBatch,
        textMaxChars: TEXT_MAX_CHARS,
      },
      // Contribution-only guests learn nothing about how much others added (DESIGN-SYSTEM §11.3).
      counts: canListAll(p) ? await this.counts(p.collectionId) : null,
    };
  }

  private async counts(collectionId: string): Promise<GuestContext['counts']> {
    const result = await this.prisma.contentItem.aggregate({
      where: { collectionId, deletedAt: null },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    return {
      total: result._count._all,
      lastAddedAt: result._max.createdAt?.toISOString() ?? null,
    };
  }
}
