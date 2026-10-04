import { Injectable } from '@nestjs/common';
import type { LegalAcceptanceRequest, MeResponse, UpdateMeRequest } from '@stepler/contracts';
import type { AccountPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { LegalService } from '../legal/legal.service.js';

const ME_FIELDS = { id: true, email: true, displayName: true, locale: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legal: LegalService,
  ) {}

  async me(principal: AccountPrincipal): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: ME_FIELDS,
    });
    if (user === null) throw new AppError('UNAUTHENTICATED', 401);
    return this.toMe(principal, user);
  }

  async updateMe(principal: AccountPrincipal, changes: UpdateMeRequest): Promise<MeResponse> {
    const user = await this.prisma.user.update({
      where: { id: principal.userId },
      data: {
        ...(changes.displayName === undefined ? {} : { displayName: changes.displayName }),
        ...(changes.locale === undefined ? {} : { locale: changes.locale }),
      },
      select: ME_FIELDS,
    });
    return this.toMe(principal, user);
  }

  /** Records the fallback page's acceptance and returns the updated profile. */
  async acceptLegal(
    principal: AccountPrincipal,
    body: LegalAcceptanceRequest,
    requestId: string | undefined,
  ): Promise<MeResponse> {
    await this.legal.accept(principal.userId, body, requestId);
    return this.me(principal);
  }

  private async toMe(
    principal: AccountPrincipal,
    user: Omit<MeResponse, 'isOperator' | 'legal'>,
  ): Promise<MeResponse> {
    return {
      ...user,
      isOperator: principal.kind === 'operator',
      legal: await this.legal.statusFor(principal.userId),
    };
  }
}
