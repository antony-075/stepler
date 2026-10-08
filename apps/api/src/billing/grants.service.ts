import { Injectable, Logger } from '@nestjs/common';
import type {
  OperatorBillingAccount,
  OperatorOfferList,
  SubscriptionDto,
} from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import type { OperatorPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { toAccessDto } from './access-dto.js';
import { toOperatorOffer, toSubscriptionDto } from './billing-dto.js';
import { EntitlementResolver } from './entitlement-resolver.js';
import { LIVE_SUBSCRIPTION } from './subscriptions.service.js';

/**
 * Complimentary plans (ADR 0018 [P13]): the operator gives an account a subscription offer's
 * limits, with or without an end, and nothing is paid. Billing is not content, so the operator
 * finds any account by its exact e-mail (no reported-scope rule as for moderation).
 */
@Injectable()
export class GrantsService {
  private readonly logger = new Logger(GrantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementResolver,
  ) {}

  /** `404` for an unknown address: the console says "no such account". */
  async accountByEmail(op: OperatorPrincipal, email: string): Promise<OperatorBillingAccount> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, createdAt: true, trialEndsAt: true },
    });
    if (user === null) throw new AppError('NOT_FOUND', 404);
    const [access, live, locale] = await Promise.all([
      this.entitlements.forAccount(user.id),
      this.prisma.subscription.findFirst({
        where: { userId: user.id, ...LIVE_SUBSCRIPTION },
        include: { offer: { select: { titleUk: true, titleEn: true } } },
      }),
      this.localeOf(op),
    ]);
    return {
      userId: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      access: toAccessDto(access),
      trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
      subscription: live === null ? null : toSubscriptionDto(live, locale),
    };
  }

  /** Every offer, active or not, best first per kind: a grant may use a draft offer. */
  async offers(): Promise<OperatorOfferList> {
    const rows = await this.prisma.billingOffer.findMany({
      orderBy: [{ kind: 'asc' }, { rank: 'asc' }, { code: 'asc' }],
    });
    return { items: rows.map(toOperatorOffer) };
  }

  /**
   * Grants `offerId`'s limits (a snapshot, [B10]) from now to `endsAt` (`null` = until revoked).
   * A live complimentary grant is replaced (ended now); a live paid subscription is never
   * overridden (`409 SUBSCRIPTION_EXISTS`: cancel it first). Not a subscription offer → `400`.
   * The account's scheduled deletions are lifted at once ([P5]).
   */
  async grant(
    op: OperatorPrincipal,
    input: { userId: string; offerId: string; endsAt: Date | null; reason: string },
    requestId?: string,
  ): Promise<SubscriptionDto> {
    const now = new Date();
    if (input.endsAt !== null && input.endsAt.getTime() <= now.getTime()) {
      throw new AppError('VALIDATION_FAILED', 400, {
        errors: [{ path: ['endsAt'], message: 'Must be in the future' }],
      });
    }
    const offer = await this.prisma.billingOffer.findUnique({ where: { id: input.offerId } });
    if (offer?.kind !== 'SUBSCRIPTION') {
      throw new AppError('VALIDATION_FAILED', 400, {
        errors: [{ path: ['offerId'], message: 'Not a subscription offer' }],
      });
    }
    const locale = await this.localeOf(op);
    const row = await this.prisma.$transaction(async (tx) => {
      // Lock order [C9]: the user row first, as every limit check does.
      const [user] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"::text AS "id" FROM "User" WHERE "id" = ${input.userId}::uuid FOR UPDATE`;
      if (user === undefined) throw new AppError('NOT_FOUND', 404);
      const live = await tx.subscription.findFirst({
        where: { userId: user.id, ...LIVE_SUBSCRIPTION },
      });
      if (live?.source === 'LIQPAY') throw new AppError('SUBSCRIPTION_EXISTS', 409);
      if (live !== null) {
        await tx.subscription.update({
          where: { id: live.id },
          data: { status: 'EXPIRED', endedAt: now },
        });
      }
      const created = await tx.subscription.create({
        data: {
          userId: user.id,
          source: 'COMPLIMENTARY',
          status: 'ACTIVE',
          offerId: offer.id,
          activeCollections: offer.activeCollections ?? 0,
          storageBytes: offer.storageBytes ?? 0n,
          collectionStorageBytes: offer.collectionStorageBytes ?? 0n,
          guestLinks: offer.guestLinks ?? 0,
          features: offer.features as Prisma.InputJsonValue,
          currentPeriodStart: now,
          currentPeriodEnd: input.endsAt,
          grantReason: input.reason,
          grantedByUserId: op.userId,
        },
        include: { offer: { select: { titleUk: true, titleEn: true } } },
      });
      await tx.collection.updateMany({
        where: { ownerId: user.id, entitlement: 'ACCOUNT', deleteAfter: { not: null } },
        data: { deleteAfter: null, deletionWarnedAt30: null, deletionWarnedAt7: null },
      });
      await this.audit.record(tx, {
        actor: op,
        action: 'billing.grant',
        targetType: 'subscription',
        targetId: created.id,
        metadata: {
          userId: user.id,
          offerId: offer.id,
          endsAt: input.endsAt?.toISOString() ?? null,
          replacedId: live?.id ?? null,
          reason: input.reason,
        },
        ...(requestId === undefined ? {} : { requestId }),
      });
      return created;
    });
    this.logger.log({ msg: 'billing.grant', subscriptionId: row.id, offerId: offer.id });
    return toSubscriptionDto(row, locale);
  }

  /** Ends a live grant now. Not a live grant → `404`; repeating it → `404` too. */
  async revoke(
    op: OperatorPrincipal,
    subscriptionId: string,
    reason: string,
    requestId?: string,
  ): Promise<SubscriptionDto> {
    const locale = await this.localeOf(op);
    const row = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.subscription.findFirst({
        where: { id: subscriptionId, source: 'COMPLIMENTARY', status: 'ACTIVE' },
        select: { id: true, userId: true },
      });
      if (grant === null) throw new AppError('NOT_FOUND', 404);
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${grant.userId}::uuid FOR UPDATE`;
      const { count } = await tx.subscription.updateMany({
        where: { id: grant.id, status: 'ACTIVE' },
        data: { status: 'EXPIRED', endedAt: new Date() },
      });
      if (count === 0) throw new AppError('NOT_FOUND', 404);
      await this.audit.record(tx, {
        actor: op,
        action: 'billing.grant_revoke',
        targetType: 'subscription',
        targetId: grant.id,
        metadata: { userId: grant.userId, reason },
        ...(requestId === undefined ? {} : { requestId }),
      });
      return tx.subscription.findUniqueOrThrow({
        where: { id: grant.id },
        include: { offer: { select: { titleUk: true, titleEn: true } } },
      });
    });
    this.logger.log({ msg: 'billing.grant_revoke', subscriptionId: row.id });
    return toSubscriptionDto(row, locale);
  }

  private async localeOf(op: OperatorPrincipal): Promise<'uk' | 'en'> {
    const user = await this.prisma.user.findUnique({
      where: { id: op.userId },
      select: { locale: true },
    });
    return user?.locale ?? 'uk';
  }
}
