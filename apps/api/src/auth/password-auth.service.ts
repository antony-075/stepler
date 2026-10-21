import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectThrottlerStorage, type ThrottlerStorage } from '@nestjs/throttler';
import {
  type AuthEmailRequest,
  isCurrentLegalVersions,
  type Locale,
  type LoginRequest,
  type RegisterRequest,
} from '@stepler/contracts';
import { AuditService } from '../audit/audit.service.js';
import { EntitlementResolver } from '../billing/entitlement-resolver.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { deriveKey, hashIp } from '../crypto/keys.js';
import { constraintViolation } from '../database/constraint-violation.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { LegalService } from '../legal/legal.service.js';
import { LimitsService } from '../limits/limits.service.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { smtpErrorFields } from '../mail/smtp-error-fields.js';
import { renderAccountBlockedEmail } from '../mail/templates/account-blocked.js';
import { renderAuthMail } from '../mail/templates/auth-mail.js';
import type { AuthMailKind } from '../mail/templates/messages.js';
import { formatHours, formatMinutes } from '../mail/templates/messages.js';
import { TURNSTILE_VERIFIER, type TurnstileVerifier } from '../turnstile/turnstile-verifier.js';
import { EmailTokens } from './email-tokens.service.js';
import { LoginFailures } from './login-failures.js';
import { PasswordHasher } from './password-hasher.js';
import { hashToken } from './tokens.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

type Tx = Prisma.TransactionClient;

/**
 * E-mail + password accounts (ADR 0019). Every mail-sending request looks the same to the caller
 * whatever the address (no account enumeration) and sends its mail after the response, so the
 * SMTP round trip does not show either. Sign-in answers one `401 INVALID_CREDENTIALS` for an
 * unknown address and a wrong password, after the same Argon2 work.
 */
@Injectable()
export class PasswordAuthService {
  private readonly logger = new Logger(PasswordAuthService.name);
  private readonly ipKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: EmailTokens,
    private readonly failures: LoginFailures,
    private readonly limits: LimitsService,
    private readonly legal: LegalService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementResolver,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TURNSTILE_VERIFIER) private readonly turnstile: TurnstileVerifier,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @InjectThrottlerStorage() private readonly throttle: ThrottlerStorage,
  ) {
    this.ipKey = deriveKey(env.APP_SECRET, 'ip-hash');
  }

  // ── registration and the address ──────────────────────────────────────────────────────────

  /**
   * A new address gets an unverified account and a verification mail. An unverified account of
   * the address takes the new password (whoever set the old one never proved the mailbox) and a
   * new mail; a verified one gets an «account exists» notice instead; a blocked one, the blocked
   * notice. The caller always sees the same `202`.
   */
  async register(
    input: RegisterRequest,
    ip: string | undefined,
    requestId: string | undefined,
  ): Promise<void> {
    await this.passTurnstile(input.turnstileToken, ip);
    if (!isCurrentLegalVersions(input.legal)) throw new AppError('LEGAL_VERSION_OUTDATED', 400);
    await this.countMailRequest(ip);
    const passwordHash = await this.hasher.hash(input.password);
    const { email } = input;
    const existing = await this.findByEmail(email);

    if (existing?.status === 'BLOCKED') return this.blockedNotice(email, existing.locale);
    if (existing?.emailVerifiedAt != null) {
      if (await this.onceAnHour(`account-exists:${hashToken(email)}`)) {
        void this.sendMail('exists', email, existing.locale, `${this.env.APP_ORIGIN}/login`, null);
      }
      return;
    }
    if (existing !== null && (await this.tokens.sentLastHour(existing.id)) >= this.mailLimit()) {
      return;
    }

    const locale = existing?.locale ?? input.locale ?? 'uk';
    const userId = await this.prisma.$transaction(async (tx) => {
      const id = existing?.id ?? (await this.createUnverified(tx, email, locale));
      if (id === null) return null;
      await tx.passwordCredential.upsert({
        where: { userId: id },
        create: { userId: id, passwordHash },
        update: { passwordHash },
      });
      await tx.authAccount.upsert({
        where: { provider_providerAccountId: { provider: 'EMAIL', providerAccountId: email } },
        create: { userId: id, provider: 'EMAIL', providerAccountId: email },
        update: {},
      });
      await this.legal.recordAcceptance(tx, id, input.legal, requestId);
      await this.audit.record(tx, {
        actor: { kind: 'admin', userId: id },
        action: 'account.register',
        targetType: 'user',
        targetId: id,
        requestId,
      });
      return id;
    });
    // Two registrations of one new address raced: the other one mails.
    if (userId === null) return;
    await this.mailVerification(userId, email, locale, ip);
  }

  /** «Надіслати лист ще раз»: only an unverified account with a password gets one. */
  async resendVerification(input: AuthEmailRequest, ip: string | undefined): Promise<void> {
    await this.passTurnstile(input.turnstileToken, ip);
    await this.countMailRequest(ip);
    const user = await this.findByEmail(input.email);
    if (user === null || user.emailVerifiedAt !== null || !user.hasPassword) return;
    if (user.status === 'BLOCKED') return this.blockedNotice(input.email, user.locale);
    if ((await this.tokens.sentLastHour(user.id)) >= this.mailLimit()) return;
    await this.mailVerification(user.id, input.email, user.locale, ip);
  }

  /** Read-only: whose address the link confirms (the page shows it before the click). */
  async previewVerification(token: string): Promise<{ email: string }> {
    const email = await this.tokens.preview(token, 'VERIFY_EMAIL');
    if (email === null) throw new AppError('AUTH_TOKEN_INVALID', 400);
    return { email };
  }

  /**
   * Uses the link: the address is confirmed and the trial starts now ([B7]: once, from the
   * first confirmed sign-in). Returns the user to sign in.
   */
  async confirmVerification(token: string, requestId: string | undefined): Promise<string> {
    const userId = await this.prisma.$transaction(async (tx) => {
      const id = await this.tokens.consume(tx, token, 'VERIFY_EMAIL');
      if (id === null) return null;
      await this.markVerified(tx, id);
      await this.audit.record(tx, {
        actor: { kind: 'admin', userId: id },
        action: 'account.email_verify',
        targetType: 'user',
        targetId: id,
        requestId,
      });
      return id;
    });
    if (userId === null) throw new AppError('AUTH_TOKEN_INVALID', 400);
    return this.active(userId);
  }

  // ── sign-in ───────────────────────────────────────────────────────────────────────────────

  /**
   * The user to sign in. Failures are counted per address + IP and per address; over either
   * limit the request is `429` before any password is checked.
   */
  async login(input: LoginRequest, ip: string | undefined): Promise<string> {
    const limits = this.limits.auth();
    const address = `login:${hashToken(input.email)}`;
    const pair = `${address}:${ip === undefined ? '-' : hashIp(this.ipKey, ip)}`;
    const wait =
      (await this.failures.blockedFor(pair, limits.loginFailuresPerAddressIpPer15Min)) ??
      (await this.failures.blockedFor(address, limits.loginFailuresPerAddressPerHour));
    if (wait !== null) {
      throw new AppError('RATE_LIMITED', 429, { retryable: true, retryAfterSeconds: wait });
    }

    const user = await this.findByEmail(input.email);
    const matches =
      user?.passwordHash == null
        ? await this.hasher.verifyNothing(input.password)
        : await this.hasher.verify(user.passwordHash, input.password);
    if (user === null || !matches) {
      await this.failures.record(pair, 15 * MINUTE_MS);
      await this.failures.record(address, HOUR_MS);
      throw new AppError('INVALID_CREDENTIALS', 401);
    }
    await this.failures.clear(pair);
    if (user.status === 'BLOCKED') throw new AppError('ACCOUNT_BLOCKED', 403);
    if (user.emailVerifiedAt === null) throw new AppError('EMAIL_NOT_VERIFIED', 403);
    return user.id;
  }

  // ── passwords ─────────────────────────────────────────────────────────────────────────────

  /**
   * «Забули пароль?»: any account of the address may get a link, including one without a
   * password yet (from Google), which sets its first. Always the same `202`.
   */
  async forgotPassword(input: AuthEmailRequest, ip: string | undefined): Promise<void> {
    await this.passTurnstile(input.turnstileToken, ip);
    await this.countMailRequest(ip);
    const user = await this.findByEmail(input.email);
    if (user === null) return;
    if (user.status === 'BLOCKED') return this.blockedNotice(input.email, user.locale);
    if ((await this.tokens.sentLastHour(user.id)) >= this.mailLimit()) return;
    const token = await this.tokens.issue(
      user.id,
      'RESET_PASSWORD',
      this.env.PASSWORD_RESET_TTL_MINUTES * MINUTE_MS,
      ip === undefined ? undefined : hashIp(this.ipKey, ip),
    );
    void this.sendMail(
      'reset',
      input.email,
      user.locale,
      `${this.env.APP_ORIGIN}/reset-password?token=${token}`,
      formatMinutes(user.locale, this.env.PASSWORD_RESET_TTL_MINUTES),
    );
  }

  /**
   * Sets the password from a reset link. The link proves the mailbox, so the address counts as
   * confirmed; every session of the account ends. Returns the user to sign in.
   */
  async resetPassword(
    token: string,
    password: string,
    requestId: string | undefined,
  ): Promise<string> {
    const passwordHash = await this.hasher.hash(password);
    const userId = await this.prisma.$transaction(async (tx) => {
      const id = await this.tokens.consume(tx, token, 'RESET_PASSWORD');
      if (id === null) return null;
      await tx.passwordCredential.upsert({
        where: { userId: id },
        create: { userId: id, passwordHash },
        update: { passwordHash },
      });
      const { email } = await tx.user.findUniqueOrThrow({
        where: { id },
        select: { email: true },
      });
      await tx.authAccount.upsert({
        where: { provider_providerAccountId: { provider: 'EMAIL', providerAccountId: email } },
        create: { userId: id, provider: 'EMAIL', providerAccountId: email },
        update: {},
      });
      await this.markVerified(tx, id);
      await tx.authSession.deleteMany({ where: { userId: id } });
      await this.audit.record(tx, {
        actor: { kind: 'admin', userId: id },
        action: 'account.password_reset',
        targetType: 'user',
        targetId: id,
        requestId,
      });
      return id;
    });
    if (userId === null) throw new AppError('AUTH_TOKEN_INVALID', 400);
    return this.active(userId);
  }

  /**
   * Signed in: the current password, then the new one. Every other session of the account ends;
   * the current one stays. An account without a password sets one through a reset link instead
   * (a stolen session must not be able to add a way in).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionToken: string | undefined,
    requestId: string | undefined,
  ): Promise<void> {
    const key = `change:${userId}`;
    const wait = await this.failures.blockedFor(
      key,
      this.limits.auth().loginFailuresPerAddressIpPer15Min,
    );
    if (wait !== null) {
      throw new AppError('RATE_LIMITED', 429, { retryable: true, retryAfterSeconds: wait });
    }
    const credential = await this.prisma.passwordCredential.findUnique({ where: { userId } });
    const matches =
      credential === null
        ? await this.hasher.verifyNothing(currentPassword)
        : await this.hasher.verify(credential.passwordHash, currentPassword);
    if (!matches) {
      await this.failures.record(key, 15 * MINUTE_MS);
      throw new AppError('CURRENT_PASSWORD_INVALID', 400);
    }
    await this.failures.clear(key);
    const passwordHash = await this.hasher.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordCredential.update({ where: { userId }, data: { passwordHash } });
      await tx.authSession.deleteMany({
        where: {
          userId,
          ...(currentSessionToken === undefined
            ? {}
            : { tokenHash: { not: hashToken(currentSessionToken) } }),
        },
      });
      await this.audit.record(tx, {
        actor: { kind: 'admin', userId },
        action: 'account.password_change',
        targetType: 'user',
        targetId: userId,
        requestId,
      });
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────────────────────

  private async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        status: true,
        locale: true,
        emailVerifiedAt: true,
        passwordCredential: { select: { passwordHash: true } },
      },
    });
    if (user === null) return null;
    const { passwordCredential, ...rest } = user;
    return {
      ...rest,
      passwordHash: passwordCredential?.passwordHash ?? null,
      hasPassword: passwordCredential !== null,
    };
  }

  /** `null` when another registration created the address meanwhile. */
  private async createUnverified(tx: Tx, email: string, locale: Locale): Promise<string | null> {
    try {
      // No trial yet: it starts when the address is confirmed (`markVerified`).
      const user = await tx.user.create({ data: { email, locale }, select: { id: true } });
      return user.id;
    } catch (error) {
      if (constraintViolation(error)?.constraint === 'User_email_key') return null;
      throw error;
    }
  }

  /** The address confirmed, and the trial started if the account has none yet ([B7]). */
  private async markVerified(tx: Tx, userId: string): Promise<void> {
    const now = new Date();
    await tx.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });
    const trialEndsAt = await this.entitlements.trialEndsAtFor(now);
    await tx.user.updateMany({ where: { id: userId, trialEndsAt: null }, data: { trialEndsAt } });
  }

  private async active(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true },
    });
    if (user.status === 'BLOCKED') throw new AppError('ACCOUNT_BLOCKED', 403);
    return userId;
  }

  private async mailVerification(
    userId: string,
    email: string,
    locale: Locale,
    ip: string | undefined,
  ): Promise<void> {
    const token = await this.tokens.issue(
      userId,
      'VERIFY_EMAIL',
      this.env.EMAIL_VERIFICATION_TTL_HOURS * HOUR_MS,
      ip === undefined ? undefined : hashIp(this.ipKey, ip),
    );
    void this.sendMail(
      'verify',
      email,
      locale,
      `${this.env.APP_ORIGIN}/auth/verify?token=${token}`,
      formatHours(locale, this.env.EMAIL_VERIFICATION_TTL_HOURS),
    );
  }

  private mailLimit(): number {
    return this.limits.auth().emailsPerAddressPerHour;
  }

  private async passTurnstile(token: string, ip: string | undefined): Promise<void> {
    if (!(await this.turnstile.verify(token, ip))) throw new AppError('TURNSTILE_FAILED', 400);
  }

  /** Per-IP hourly limit on mail-sending requests, counted only after Turnstile passed. */
  private async countMailRequest(ip: string | undefined): Promise<void> {
    if (ip === undefined) return;
    const limit = this.limits.auth().emailsPerIpPerHour;
    const record = await this.throttle.increment(
      `auth-mail:${hashIp(this.ipKey, ip)}`,
      HOUR_MS,
      limit,
      HOUR_MS,
      'auth-mail',
    );
    if (record.isBlocked) {
      throw new AppError('RATE_LIMITED', 429, {
        retryable: true,
        retryAfterSeconds: Math.max(1, Math.ceil(record.timeToBlockExpire)),
      });
    }
  }

  /** Shared by every instance (`RateLimitStore`); the key carries the address's hash only. */
  private async onceAnHour(key: string): Promise<boolean> {
    const record = await this.throttle.increment(key, HOUR_MS, 1, HOUR_MS, 'auth-notice');
    return !record.isBlocked;
  }

  /** A blocked account's mailbox learns why no link comes ([Q3]), at most once an hour. */
  private async blockedNotice(email: string, locale: Locale): Promise<void> {
    if (!(await this.onceAnHour(`account-blocked:${hashToken(email)}`))) return;
    void (async () => {
      try {
        await this.mailer.send({
          to: email,
          ...renderAccountBlockedEmail({ locale, contactEmail: this.env.LEGAL_CONTACT_EMAIL }),
        });
      } catch (error) {
        this.logger.error({ msg: 'Account blocked email failed', ...smtpErrorFields(error) });
      }
    })();
  }

  private async sendMail(
    kind: AuthMailKind,
    email: string,
    locale: Locale,
    url: string,
    duration: string | null,
  ): Promise<void> {
    try {
      await this.mailer.send({ to: email, ...renderAuthMail({ kind, url, locale, duration }) });
    } catch (error) {
      this.logger.error({ msg: 'Account email failed', kind, ...smtpErrorFields(error) });
    }
  }
}
