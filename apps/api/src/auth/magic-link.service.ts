import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Locale, MagicLinkPreviewResponse, MagicLinkRequest } from '@stepler/contracts';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { deriveKey, hashIp } from '../crypto/keys.js';
import { constraintViolation } from '../database/constraint-violation.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { LimitsService } from '../limits/limits.service.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { renderMagicLinkEmail } from '../mail/templates/magic-link.js';
import { TURNSTILE_VERIFIER, type TurnstileVerifier } from '../turnstile/turnstile-verifier.js';
import { generateToken, hashToken } from './tokens.js';

const HOUR_MS = 3600_000;

interface ConsumedToken {
  email: string;
  locale: Locale;
}

@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);
  private readonly ipKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TURNSTILE_VERIFIER) private readonly turnstile: TurnstileVerifier,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {
    this.ipKey = deriveKey(env.APP_SECRET, 'ip-hash');
  }

  /**
   * Issues a link if allowed. Every outcome after Turnstile looks the same to the caller
   * (Review Focus 3), and mail goes out after the response so timing doesn't differ either.
   */
  async request(input: MagicLinkRequest, ip: string | undefined): Promise<void> {
    if (!(await this.turnstile.verify(input.turnstileToken, ip))) {
      throw new AppError('TURNSTILE_FAILED', 400);
    }
    const { email } = input;
    const recent = await this.prisma.magicLinkToken.count({
      where: { email, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
    });
    if (recent >= this.limits.magicLink().perEmailPerHour) return;

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { status: true, locale: true },
    });
    if (user?.status === 'BLOCKED') return;

    const locale = user?.locale ?? input.locale ?? 'uk';
    const token = generateToken();
    await this.prisma.magicLinkToken.create({
      data: {
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + this.env.MAGIC_LINK_TTL_MINUTES * 60_000),
        locale,
        ...(ip === undefined ? {} : { requestIpHash: hashIp(this.ipKey, ip) }),
      },
    });
    void this.sendLink(email, token, locale);
  }

  /** Read-only: shows whose account the link signs in to (owner decision, 2026-09-29). */
  async preview(token: string): Promise<MagicLinkPreviewResponse> {
    const row = await this.prisma.magicLinkToken.findFirst({
      where: { tokenHash: hashToken(token), consumedAt: null, expiresAt: { gt: new Date() } },
      select: { email: true },
    });
    if (row === null) throw new AppError('MAGIC_LINK_INVALID', 400);
    return { email: row.email };
  }

  /** Consumes the token atomically and returns the signed-in user id. */
  async verify(token: string): Promise<string> {
    // One statement: of two concurrent verifies, only one sees the row (Review Focus 2).
    const [consumed] = await this.prisma.$queryRaw<ConsumedToken[]>`
      UPDATE "MagicLinkToken" SET "consumedAt" = now()
      WHERE "tokenHash" = ${hashToken(token)} AND "consumedAt" IS NULL AND "expiresAt" > now()
      RETURNING "email"::text AS email, "locale"::text AS locale`;
    if (consumed === undefined) throw new AppError('MAGIC_LINK_INVALID', 400);
    return this.signInByEmail(consumed);
  }

  private async signInByEmail({ email, locale }: ConsumedToken): Promise<string> {
    const user = await this.findOrCreateUser(email, locale);
    if (user.status === 'BLOCKED') throw new AppError('ACCOUNT_BLOCKED', 403);
    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { id: user.id, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.authAccount.upsert({
        where: { provider_providerAccountId: { provider: 'EMAIL', providerAccountId: email } },
        create: { userId: user.id, provider: 'EMAIL', providerAccountId: email },
        update: {},
      }),
    ]);
    return user.id;
  }

  private async findOrCreateUser(email: string, locale: Locale) {
    const select = { id: true, status: true } as const;
    const existing = await this.prisma.user.findUnique({ where: { email }, select });
    if (existing !== null) return existing;
    try {
      return await this.prisma.user.create({
        data: { email, locale, emailVerifiedAt: new Date() },
        select,
      });
    } catch (error) {
      // Two first sign-ins for one address raced; the other created the user.
      if (constraintViolation(error)?.constraint !== 'User_email_key') throw error;
      return this.prisma.user.findUniqueOrThrow({ where: { email }, select });
    }
  }

  private async sendLink(email: string, token: string, locale: Locale): Promise<void> {
    const url = `${this.env.APP_ORIGIN}/auth/verify?token=${token}`;
    try {
      await this.mailer.send({
        to: email,
        ...renderMagicLinkEmail({ url, locale, expiresInMinutes: this.env.MAGIC_LINK_TTL_MINUTES }),
      });
    } catch (error) {
      // Never log the address or the link; the error name/message is enough to diagnose SMTP.
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown';
      this.logger.error({ msg: 'Magic link email failed', reason });
    }
  }
}
