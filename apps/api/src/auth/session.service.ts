import { Inject, Injectable } from '@nestjs/common';
import { legalStatus } from '@stepler/contracts';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { LEGAL_ACCEPTANCE_FIELDS, toAcceptanceRecords } from '../legal/legal.service.js';
import { generateToken, hashToken, TOKEN_PATTERN } from './tokens.js';

const DAY_MS = 24 * 3600_000;
/** `lastUsedAt` is refreshed at most this often, so reads don't write on every request. */
const LAST_USED_RESOLUTION_MS = 3600_000;

export interface ResolvedSession {
  userId: string;
  email: string;
  emailVerifiedAt: Date | null;
  /** Both legal documents accepted (ADR 0016); `AuthGuard` gates on it. */
  legalAccepted: boolean;
}

/** Opaque server-side sessions (ADR 0006): the cookie holds the token, the DB only its hash. */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async create(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_DAYS * DAY_MS);
    await this.prisma.authSession.create({
      data: { userId, tokenHash: hashToken(token), expiresAt },
    });
    return { token, expiresAt };
  }

  /** `null` for unknown, expired or blocked-user sessions. One query, plus a rare touch. */
  async resolve(token: string): Promise<ResolvedSession | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        expiresAt: true,
        lastUsedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            status: true,
            // Same query, no second round trip per request (plan: session resolution).
            legalAcceptances: { select: LEGAL_ACCEPTANCE_FIELDS },
          },
        },
      },
    });
    const now = Date.now();
    if (session === null || session.expiresAt.getTime() <= now) return null;
    if (session.user.status !== 'ACTIVE') return null;
    if (now - session.lastUsedAt.getTime() >= LAST_USED_RESOLUTION_MS) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date(now) },
      });
    }
    return {
      userId: session.user.id,
      email: session.user.email,
      emailVerifiedAt: session.user.emailVerifiedAt,
      legalAccepted: legalStatus(toAcceptanceRecords(session.user.legalAcceptances)).accepted,
    };
  }

  /** Idempotent: an unknown token is a no-op. */
  async revoke(token: string): Promise<void> {
    if (!TOKEN_PATTERN.test(token)) return;
    await this.prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.authSession.deleteMany({ where: { userId } });
  }
}
