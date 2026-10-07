import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectThrottlerStorage, type ThrottlerStorage } from '@nestjs/throttler';
import {
  isCurrentLegalVersions,
  type LegalVersions,
  type Locale,
  type MagicLinkPreviewResponse,
  type MagicLinkRequest,
} from '@stepler/contracts';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { deriveKey, hashIp } from '../crypto/keys.js';
import { constraintViolation } from '../database/constraint-violation.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { LegalService } from '../legal/legal.service.js';
import { LimitsService } from '../limits/limits.service.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { renderAccountBlockedEmail } from '../mail/templates/account-blocked.js';
import { renderMagicLinkEmail } from '../mail/templates/magic-link.js';
import { TURNSTILE_VERIFIER, type TurnstileVerifier } from '../turnstile/turnstile-verifier.js';
import { generateToken, hashToken } from './tokens.js';

const HOUR_MS = 3600_000;

interface ConsumedToken {
  email: string;
  locale: Locale;
  legalTermsVersion: string | null;
  legalPrivacyVersion: string | null;
}

@Injectable()
export class MagicLinkService {
  private readonly logger = new Logger(MagicLinkService.name);
  private readonly ipKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly legal: LegalService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TURNSTILE_VERIFIER) private readonly turnstile: TurnstileVerifier,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @InjectThrottlerStorage() private readonly throttle: ThrottlerStorage,
  ) {
    this.ipKey = deriveKey(env.APP_SECRET, 'ip-hash');
  }

  /**
   * Issues a link if allowed. Every outcome after Turnstile looks the same to the caller
   * (Review Focus 3), and mail goes out after the response so timing doesn't differ either.
   * The accepted legal versions must be the current ones (a stale card: `400
   * LEGAL_VERSION_OUTDATED`, before the IP counter and any row); they ride on the token row.
   */
  async request(input: MagicLinkRequest, ip: string | undefined): Promise<void> {
    if (!(await this.turnstile.verify(input.turnstileToken, ip))) {
      throw new AppError('TURNSTILE_FAILED', 400);
    }
    if (!isCurrentLegalVersions(input.legal)) throw new AppError('LEGAL_VERSION_OUTDATED', 400);
    await this.countIpRequest(ip);
    const { email } = input;
    const recent = await this.prisma.magicLinkToken.count({
      where: { email, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
    });
    if (recent >= this.limits.magicLink().perEmailPerHour) return;

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { status: true, locale: true },
    });
    if (user?.status === 'BLOCKED') {
      // Instead of a link, the account's own mailbox learns why none comes ([Q3]); at most once
      // an hour, so the requests cannot flood it. The answer stays the same `202`.
      if (await this.firstBlockedNoticeThisHour(email)) {
        void this.sendBlockedNotice(email, user.locale);
      }
      return;
    }

    const locale = user?.locale ?? input.locale ?? 'uk';
    const token = generateToken();
    await this.prisma.magicLinkToken.create({
      data: {
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + this.env.MAGIC_LINK_TTL_MINUTES * 60_000),
        locale,
        legalTermsVersion: input.legal.terms,
        legalPrivacyVersion: input.legal.privacy,
        ...(ip === undefined ? {} : { requestIpHash: hashIp(this.ipKey, ip) }),
      },
    });
    void this.sendLink(email, token, locale);
  }

  /** Per-IP hourly limit, counted only for requests that passed Turnstile. */
  private async countIpRequest(ip: string | undefined): Promise<void> {
    if (ip === undefined) return;
    const record = await this.throttle.increment(
      `magic-link:${hashIp(this.ipKey, ip)}`,
      HOUR_MS,
      this.limits.magicLink().perIpPerHour,
      HOUR_MS,
      'magic-link',
    );
    if (record.isBlocked) {
      throw new AppError('RATE_LIMITED', 429, {
        retryable: true,
        retryAfterSeconds: Math.max(1, Math.ceil(record.timeToBlockExpire)),
      });
    }
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
  async verify(token: string, requestId: string | undefined): Promise<string> {
    // One statement: of two concurrent verifies, only one sees the row (Review Focus 2).
    const [consumed] = await this.prisma.$queryRaw<ConsumedToken[]>`
      UPDATE "MagicLinkToken" SET "consumedAt" = now()
      WHERE "tokenHash" = ${hashToken(token)} AND "consumedAt" IS NULL AND "expiresAt" > now()
      RETURNING "email"::text AS email, "locale"::text AS locale,
                "legalTermsVersion", "legalPrivacyVersion"`;
    if (consumed === undefined) throw new AppError('MAGIC_LINK_INVALID', 400);
    return this.signInByEmail(consumed, requestId);
  }

  /**
   * Completes the sign-in and records the legal acceptance the link carries, in one transaction
   * (ADR 0016). A link from before the checkbox carries none and records nothing; a version that
   * is no longer current is skipped by `recordAcceptance`; either way the gate takes over.
   */
  private async signInByEmail(
    consumed: ConsumedToken,
    requestId: string | undefined,
  ): Promise<string> {
    const { email, locale } = consumed;
    const user = await this.findOrCreateUser(email, locale);
    if (user.status === 'BLOCKED') throw new AppError('ACCOUNT_BLOCKED', 403);
    const legal = legalVersionsOf(consumed);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id: user.id, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.authAccount.upsert({
        where: { provider_providerAccountId: { provider: 'EMAIL', providerAccountId: email } },
        create: { userId: user.id, provider: 'EMAIL', providerAccountId: email },
        update: {},
      });
      if (legal !== null) await this.legal.recordAcceptance(tx, user.id, legal, requestId);
    });
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

  /** In memory, per instance, like the IP limit; the key is the address's hash, never the address. */
  private async firstBlockedNoticeThisHour(email: string): Promise<boolean> {
    const record = await this.throttle.increment(
      `account-blocked:${hashToken(email.toLowerCase())}`,
      HOUR_MS,
      1,
      HOUR_MS,
      'account-blocked',
    );
    return !record.isBlocked;
  }

  private async sendBlockedNotice(email: string, locale: Locale): Promise<void> {
    try {
      await this.mailer.send({
        to: email,
        ...renderAccountBlockedEmail({ locale, contactEmail: this.env.LEGAL_CONTACT_EMAIL }),
      });
    } catch (error) {
      this.logger.error({ msg: 'Account blocked email failed', ...smtpErrorFields(error) });
    }
  }

  private async sendLink(email: string, token: string, locale: Locale): Promise<void> {
    const url = `${this.env.APP_ORIGIN}/auth/verify?token=${token}`;
    try {
      await this.mailer.send({
        to: email,
        ...renderMagicLinkEmail({
          url,
          locale,
          expiresInMinutes: this.env.MAGIC_LINK_TTL_MINUTES,
          appOrigin: this.env.APP_ORIGIN,
        }),
      });
    } catch (error) {
      this.logger.error({ msg: 'Magic link email failed', ...smtpErrorFields(error) });
    }
  }
}

/** The versions stored on a token row, or `null` for a link issued before slice 10. */
function legalVersionsOf(row: ConsumedToken): LegalVersions | null {
  if (row.legalTermsVersion === null || row.legalPrivacyVersion === null) return null;
  return { terms: row.legalTermsVersion, privacy: row.legalPrivacyVersion };
}

/**
 * Diagnosable SMTP failure fields without the message: nodemailer appends the server's reply
 * to it, and replies usually quote the recipient address (rule 09).
 */
export function smtpErrorFields(error: unknown): Record<string, string | number> {
  if (!(error instanceof Error)) return { error: 'non-error' };
  const { code, responseCode, command } = error as {
    code?: unknown;
    responseCode?: unknown;
    command?: unknown;
  };
  return {
    error: error.name,
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof responseCode === 'number' ? { responseCode } : {}),
    ...(typeof command === 'string' ? { command } : {}),
  };
}
