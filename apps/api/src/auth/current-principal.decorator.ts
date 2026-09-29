import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { AppError } from '../errors/app-error.js';
import type { Principal, RequestWithPrincipal } from './principal.js';

/** The authenticated principal set by `AuthGuard`; only valid on non-public routes. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal = context.switchToHttp().getRequest<RequestWithPrincipal>().principal;
    if (principal === undefined) throw new AppError('UNAUTHENTICATED', 401);
    return principal;
  },
);
