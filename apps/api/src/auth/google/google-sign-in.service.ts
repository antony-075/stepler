import { Injectable } from '@nestjs/common';
import type { LegalVersions } from '@stepler/contracts';
import { EntitlementResolver } from '../../billing/entitlement-resolver.js';
import { constraintViolation } from '../../database/constraint-violation.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AppError } from '../../errors/app-error.js';
import { LegalService } from '../../legal/legal.service.js';
import type { GoogleClaims } from './google-identity.js';

const MAX_DISPLAY_NAME = 80;

/**
 * Google's profile name as a display name: control characters dropped, trimmed, cut to 80
 * characters; `undefined` when nothing is left.
 */
export function displayNameFromGoogle(name: string | undefined): string | undefined {
  // Removing control characters is the point of this pattern.
  // eslint-disable-next-line no-control-regex
  const clean = name?.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (clean === undefined || clean === '') return undefined;
  return Array.from(clean).slice(0, MAX_DISPLAY_NAME).join('').trim();
}

/**
 * Maps a Google identity to a user (ADR 0006). An unverified Google email never creates or
 * links an account: otherwise someone could pre-register a victim's address through Google.
 * The legal versions from the signed OAuth transaction are recorded in the transaction that
 * completes the sign-in (ADR 0016); stale or absent ones record nothing and the gate takes over.
 * Linking to an address that was registered but never confirmed drops its password (ADR 0019):
 * whoever set it never proved the mailbox; Google just did.
 */
@Injectable()
export class GoogleSignInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legal: LegalService,
    private readonly entitlements: EntitlementResolver,
  ) {}

  async signIn(
    claims: GoogleClaims,
    legal: LegalVersions | null,
    requestId: string | undefined,
  ): Promise<string> {
    const linked = await this.prisma.authAccount.findUnique({
      where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: claims.sub } },
      select: { user: { select: { id: true, status: true } } },
    });
    if (linked !== null) {
      const userId = this.active(linked.user);
      if (legal !== null) {
        await this.prisma.$transaction((tx) =>
          this.legal.recordAcceptance(tx, userId, legal, requestId),
        );
      }
      await this.fillDisplayName(userId, claims.name);
      return userId;
    }

    if (!claims.emailVerified) throw new AppError('OAUTH_FAILED', 400);
    const email = claims.email.trim().toLowerCase();
    const user =
      (await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, status: true, emailVerifiedAt: true },
      })) ?? (await this.createUser(email, claims.name));
    const userId = this.active(user);
    await this.prisma.$transaction(async (tx) => {
      if (user.emailVerifiedAt === null) {
        await tx.passwordCredential.deleteMany({ where: { userId } });
        const now = new Date();
        await tx.user.updateMany({
          where: { id: userId, emailVerifiedAt: null },
          data: { emailVerifiedAt: now },
        });
        // A registration never confirmed has no trial yet ([B7]: it starts now).
        await tx.user.updateMany({
          where: { id: userId, trialEndsAt: null },
          data: { trialEndsAt: await this.entitlements.trialEndsAtFor(now) },
        });
      }
      await tx.authAccount.upsert({
        where: {
          provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: claims.sub },
        },
        create: { userId, provider: 'GOOGLE', providerAccountId: claims.sub },
        update: {},
      });
      if (legal !== null) await this.legal.recordAcceptance(tx, userId, legal, requestId);
    });
    await this.fillDisplayName(userId, claims.name);
    return userId;
  }

  /**
   * Takes the verified Google name only while the user has none: a name the user set (or
   * cleared and then got again here) is never overwritten. One conditional update, so a
   * concurrent PATCH /me cannot be lost.
   */
  private async fillDisplayName(userId: string, name: string | undefined): Promise<void> {
    const displayName = displayNameFromGoogle(name);
    if (displayName === undefined) return;
    await this.prisma.user.updateMany({
      where: { id: userId, displayName: null },
      data: { displayName },
    });
  }

  private active(user: { id: string; status: 'ACTIVE' | 'BLOCKED' }): string {
    if (user.status === 'BLOCKED') throw new AppError('ACCOUNT_BLOCKED', 403);
    return user.id;
  }

  private async createUser(email: string, name: string | undefined) {
    const displayName = displayNameFromGoogle(name);
    try {
      // A new account starts its trial (ADR 0018 [B7]), as at e-mail verification.
      const createdAt = new Date();
      const trialEndsAt = await this.entitlements.trialEndsAtFor(createdAt);
      return await this.prisma.user.create({
        data: {
          email,
          emailVerifiedAt: createdAt,
          createdAt,
          trialEndsAt,
          ...(displayName === undefined ? {} : { displayName }),
        },
        select: { id: true, status: true, emailVerifiedAt: true },
      });
    } catch (error) {
      if (constraintViolation(error)?.constraint !== 'User_email_key') throw error;
      return this.prisma.user.findUniqueOrThrow({
        where: { email },
        select: { id: true, status: true, emailVerifiedAt: true },
      });
    }
  }
}
