import { Injectable } from '@nestjs/common';
import type { LegalAcceptanceRequest, MeResponse, UpdateMeRequest } from '@stepler/contracts';
import type { AccountPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { LegalService } from '../legal/legal.service.js';

const ME_FIELDS = {
  id: true,
  email: true,
  displayName: true,
  locale: true,
  passwordCredential: { select: { userId: true } },
} as const;

type MeRow = Pick<MeResponse, 'id' | 'email' | 'displayName' | 'locale'> & {
  passwordCredential: { userId: string } | null;
};

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

  /**
   * Before the legal documents are accepted only `locale` may change (the fallback page's
   * language switch, ADR 0016); a name change waits for the acceptance.
   */
  async updateMe(principal: AccountPrincipal, changes: UpdateMeRequest): Promise<MeResponse> {
    if (changes.displayName !== undefined) {
      const { accepted } = await this.legal.statusFor(principal.userId);
      if (!accepted) throw new AppError('LEGAL_ACCEPTANCE_REQUIRED', 403);
    }
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
    { passwordCredential, ...user }: MeRow,
  ): Promise<MeResponse> {
    return {
      ...user,
      isOperator: principal.kind === 'operator',
      hasPassword: passwordCredential !== null,
      legal: await this.legal.statusFor(principal.userId),
    };
  }
}
