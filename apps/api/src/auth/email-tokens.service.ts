import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthTokenPurpose, Prisma } from '../generated/prisma/client.js';
import { generateToken, hashToken } from './tokens.js';

type Db = PrismaService | Prisma.TransactionClient;

const HOUR_MS = 3600_000;

/**
 * Mailed account tokens (ADR 0019): 32 random bytes, only the SHA-256 stored, single use and
 * expiring. A new token of a purpose retires the account's unused ones, so only the newest mail
 * works.
 */
@Injectable()
export class EmailTokens {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    purpose: AuthTokenPurpose,
    ttlMs: number,
    requestIpHash: string | undefined,
  ): Promise<string> {
    const token = generateToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.authEmailToken.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.authEmailToken.create({
        data: {
          userId,
          purpose,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + ttlMs),
          ...(requestIpHash === undefined ? {} : { requestIpHash }),
        },
      });
    });
    return token;
  }

  /** Tokens mailed to the account in the last hour, any purpose: the per-address mail limit. */
  sentLastHour(userId: string): Promise<number> {
    return this.prisma.authEmailToken.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
    });
  }

  /** Read-only: the address a live token belongs to, or `null`. */
  async preview(token: string, purpose: AuthTokenPurpose): Promise<string | null> {
    const row = await this.prisma.authEmailToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { user: { select: { email: true } } },
    });
    return row?.user.email ?? null;
  }

  /** Read-only: the user a live token belongs to, or `null`. */
  async owner(token: string, purpose: AuthTokenPurpose): Promise<string | null> {
    const row = await this.prisma.authEmailToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  /**
   * Uses the token up and returns its user, or `null` when it is unknown, used or expired. One
   * conditional UPDATE: of two concurrent uses, only one sees the row.
   */
  async consume(db: Db, token: string, purpose: AuthTokenPurpose): Promise<string | null> {
    const [row] = await db.$queryRaw<{ userId: string }[]>`
      UPDATE "AuthEmailToken" SET "consumedAt" = now()
      WHERE "tokenHash" = ${hashToken(token)} AND "purpose" = ${purpose}::"AuthTokenPurpose"
        AND "consumedAt" IS NULL AND "expiresAt" > now()
      RETURNING "userId"::text AS "userId"`;
    return row?.userId ?? null;
  }
}
