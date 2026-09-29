import { Injectable } from '@nestjs/common';
import { constraintViolation } from '../../database/constraint-violation.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AppError } from '../../errors/app-error.js';
import type { GoogleClaims } from './google-identity.js';

const MAX_DISPLAY_NAME = 80;

/**
 * Maps a Google identity to a user (ADR 0006). An unverified Google email never creates or
 * links an account: otherwise someone could pre-register a victim's address through Google.
 */
@Injectable()
export class GoogleSignInService {
  constructor(private readonly prisma: PrismaService) {}

  async signIn(claims: GoogleClaims): Promise<string> {
    const linked = await this.prisma.authAccount.findUnique({
      where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: claims.sub } },
      select: { user: { select: { id: true, status: true } } },
    });
    if (linked !== null) return this.active(linked.user);

    if (!claims.emailVerified) throw new AppError('OAUTH_FAILED', 400);
    const email = claims.email.trim().toLowerCase();
    const user =
      (await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, status: true },
      })) ?? (await this.createUser(email, claims.name));
    const userId = this.active(user);
    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.authAccount.upsert({
        where: {
          provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: claims.sub },
        },
        create: { userId, provider: 'GOOGLE', providerAccountId: claims.sub },
        update: {},
      }),
    ]);
    return userId;
  }

  private active(user: { id: string; status: 'ACTIVE' | 'BLOCKED' }): string {
    if (user.status === 'BLOCKED') throw new AppError('ACCOUNT_BLOCKED', 403);
    return user.id;
  }

  private async createUser(email: string, name: string | undefined) {
    const displayName = name?.trim().slice(0, MAX_DISPLAY_NAME);
    try {
      return await this.prisma.user.create({
        data: {
          email,
          emailVerifiedAt: new Date(),
          ...(displayName === undefined || displayName === '' ? {} : { displayName }),
        },
        select: { id: true, status: true },
      });
    } catch (error) {
      if (constraintViolation(error)?.constraint !== 'User_email_key') throw error;
      return this.prisma.user.findUniqueOrThrow({
        where: { email },
        select: { id: true, status: true },
      });
    }
  }
}
