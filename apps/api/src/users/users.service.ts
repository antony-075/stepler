import { Injectable } from '@nestjs/common';
import type { MeResponse, UpdateMeRequest } from '@stepler/contracts';
import type { AccountPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';

const ME_FIELDS = { id: true, email: true, displayName: true, locale: true } as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(principal: AccountPrincipal): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: ME_FIELDS,
    });
    if (user === null) throw new AppError('UNAUTHENTICATED', 401);
    return { ...user, isOperator: principal.kind === 'operator' };
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
    return { ...user, isOperator: principal.kind === 'operator' };
  }
}
