import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { AppError } from '../errors/app-error.js';
import type { AccountPrincipal, RequestWithPrincipal } from './principal.js';

/**
 * The signed-in account set by `AuthGuard`; only valid on non-public routes. A guest principal
 * never passes for an account.
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccountPrincipal => {
    const principal = context.switchToHttp().getRequest<RequestWithPrincipal>().principal;
    if (principal === undefined || principal.kind === 'guest') {
      throw new AppError('UNAUTHENTICATED', 401);
    }
    return principal;
  },
);
