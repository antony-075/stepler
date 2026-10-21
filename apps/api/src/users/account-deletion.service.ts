import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AccountDeletionPreviewResponse } from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import { EmailTokens } from '../auth/email-tokens.service.js';
import type { AccountPrincipal } from '../auth/principal.js';
import { SubscriptionProviderSync } from '../billing/subscription-provider-sync.js';
import { LIVE_SUBSCRIPTION } from '../billing/subscriptions.service.js';
import { CollectionDeletion } from '../collections/collection-deletion.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { deriveKey, hashIp } from '../crypto/keys.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { LimitsService } from '../limits/limits.service.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { smtpErrorFields } from '../mail/smtp-error-fields.js';
import { renderAuthMail } from '../mail/templates/auth-mail.js';
import { formatMinutes } from '../mail/templates/messages.js';

/** How long the mailed deletion link works. */
export const DELETION_LINK_TTL_MINUTES = 60;
const MINUTE_MS = 60_000;

/** The interactive transaction marks every collection; a large account needs more than 5 s. */
const DELETION_TX_TIMEOUT_MS = 60_000;

/**
 * Self-service account deletion (ADR 0020). «Видалити акаунт» mails a one-time link to the
 * account's address; the link's page shows what goes and confirms. The confirmation, in one
 * transaction: every collection is marked for the usual purge (D2), sign-in methods, sessions,
 * acceptances and mailed tokens are deleted, and the user row is anonymised: the address and
 * name are removed, the status is `DELETED`. The row stays because payments and subscriptions
 * reference it (accounting records). LiqPay is told to stop every subscription first; when it
 * does not confirm, nothing is deleted and the link stays usable.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);
  private readonly ipKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: EmailTokens,
    private readonly sync: SubscriptionProviderSync,
    private readonly deletion: CollectionDeletion,
    private readonly limits: LimitsService,
    private readonly audit: AuditService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {
    this.ipKey = deriveKey(env.APP_SECRET, 'ip-hash');
  }

  /** Mails the deletion link to the signed-in account's own address. */
  async request(principal: AccountPrincipal, ip: string | undefined): Promise<void> {
    // The operator is a service account named in OPERATOR_EMAILS; it is closed by the owner.
    if (principal.kind === 'operator') throw new AppError('FORBIDDEN', 403);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: { id: true, email: true, locale: true },
    });
    if ((await this.tokens.sentLastHour(user.id)) >= this.limits.auth().emailsPerAddressPerHour) {
      throw new AppError('RATE_LIMITED', 429, { retryable: true, retryAfterSeconds: 3600 });
    }
    const token = await this.tokens.issue(
      user.id,
      'DELETE_ACCOUNT',
      DELETION_LINK_TTL_MINUTES * MINUTE_MS,
      ip === undefined ? undefined : hashIp(this.ipKey, ip),
    );
    void this.sendMail(
      user.email,
      user.locale,
      `${this.env.APP_ORIGIN}/delete-account?token=${token}`,
    );
  }

  /** Read-only: what the link would delete. */
  async preview(token: string): Promise<AccountDeletionPreviewResponse> {
    const userId = await this.liveTokenUser(token);
    const [user, collections, subscription] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
      this.prisma.collection.count({
        where: { ownerId: userId, status: { not: 'DELETING' } },
      }),
      this.prisma.subscription.count({
        where: { userId, source: 'LIQPAY', ...LIVE_SUBSCRIPTION },
      }),
    ]);
    return { email: user.email, collections, subscription: subscription > 0 };
  }

  /** Uses the link and deletes the account. */
  async confirm(token: string, requestId: string | undefined): Promise<void> {
    const userId = await this.liveTokenUser(token);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true },
    });
    if (user.status === 'BLOCKED') throw new AppError('ACCOUNT_BLOCKED', 403);
    // A checkout still payable could succeed after the deletion and buy for nobody.
    const pending = await this.prisma.payment.count({
      where: { userId, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    if (pending > 0) throw new AppError('PAYMENT_PENDING', 409);
    await this.stopSubscriptions(userId);

    // Started outside the transaction, so a first start never runs while it holds a connection.
    await this.jobs.ready();
    const now = new Date();
    await this.prisma.$transaction(
      async (tx) => {
        if ((await this.tokens.consume(tx, token, 'DELETE_ACCOUNT')) !== userId) {
          throw new AppError('AUTH_TOKEN_INVALID', 400);
        }
        await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
        const locked = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { status: true },
        });
        if (locked.status !== 'ACTIVE') throw new AppError('ACCOUNT_BLOCKED', 403);

        // Like the operator's «Завершити зараз»: a live plan ends now, without a refund.
        await tx.subscription.updateMany({
          where: { userId, status: { not: 'EXPIRED' }, canceledAt: null },
          data: { canceledAt: now },
        });
        const ended = await tx.subscription.updateMany({
          where: { userId, status: { not: 'EXPIRED' } },
          data: {
            status: 'EXPIRED',
            endedAt: now,
            pendingOfferId: null,
            pendingPriceId: null,
            pendingProviderAmountMinor: null,
          },
        });

        const actor = { kind: 'admin', userId } as const;
        const collections = await tx.$queryRaw<{ id: string; status: 'ACTIVE' | 'ARCHIVED' }[]>`
          SELECT "id"::text AS "id", "status" FROM "Collection"
          WHERE "ownerId" = ${userId}::uuid AND "status" <> 'DELETING'
          ORDER BY "id"
          FOR UPDATE`;
        for (const collection of collections) {
          await this.deletion.markDeleting(tx, {
            collectionId: collection.id,
            fromStatus: collection.status,
            actor,
            metadata: { reason: 'account_deletion' },
            ...(requestId === undefined ? {} : { requestId }),
          });
        }

        await tx.authSession.deleteMany({ where: { userId } });
        await tx.authAccount.deleteMany({ where: { userId } });
        await tx.passwordCredential.deleteMany({ where: { userId } });
        await tx.authEmailToken.deleteMany({ where: { userId } });
        await tx.legalAcceptance.deleteMany({ where: { userId } });
        await tx.user.update({
          where: { id: userId },
          data: {
            email: deletedAddress(userId),
            emailVerifiedAt: null,
            displayName: null,
            status: 'DELETED',
            deletedAt: now,
            readOnlyNotifiedAt: null,
          },
        });
        await this.audit.record(tx, {
          actor,
          action: 'account.delete',
          targetType: 'user',
          targetId: userId,
          metadata: {
            collections: collections.length,
            subscriptionsEnded: ended.count,
          },
          ...(requestId === undefined ? {} : { requestId }),
        });
      },
      { timeout: DELETION_TX_TIMEOUT_MS },
    );
    this.logger.log({ msg: 'account.deleted', userId });
  }

  private async liveTokenUser(token: string): Promise<string> {
    const row = await this.tokens.owner(token, 'DELETE_ACCOUNT');
    if (row === null) throw new AppError('AUTH_TOKEN_INVALID', 400);
    return row;
  }

  /**
   * Every LiqPay subscription LiqPay may still charge, including ended ones; `503` when one is
   * not confirmed stopped (nothing is deleted; the link still works for another try).
   */
  private async stopSubscriptions(userId: string): Promise<void> {
    const open = await this.prisma.subscription.findMany({
      where: {
        userId,
        source: 'LIQPAY',
        providerUnsubscribedAt: null,
        providerOrderId: { not: null },
      },
      select: { id: true },
    });
    for (const { id } of open) {
      if (!(await this.sync.unsubscribe(id))) {
        throw new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 503, { retryable: true });
      }
    }
  }

  private async sendMail(email: string, locale: 'uk' | 'en', url: string): Promise<void> {
    try {
      await this.mailer.send({
        to: email,
        ...renderAuthMail({
          kind: 'delete',
          url,
          locale,
          duration: formatMinutes(locale, DELETION_LINK_TTL_MINUTES),
        }),
      });
    } catch (error) {
      this.logger.error({ msg: 'Account email failed', kind: 'delete', ...smtpErrorFields(error) });
    }
  }
}

/**
 * The anonymised address of a deleted account: unique (the column is), never deliverable
 * (`.invalid` is reserved, RFC 2606), so no sign-in or mail can reach it again.
 */
export function deletedAddress(userId: string): string {
  return `deleted-${userId}@deleted.invalid`;
}
