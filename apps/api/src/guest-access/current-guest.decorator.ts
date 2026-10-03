import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { GuestPrincipal, RequestWithPrincipal } from '../auth/principal.js';
import { AppError } from '../errors/app-error.js';

/** The guest principal set by `GuestSessionGuard`; only valid on routes it protects. */
export const CurrentGuest = createParamDecorator(
  (_data: unknown, context: ExecutionContext): GuestPrincipal => {
    const principal = context.switchToHttp().getRequest<RequestWithPrincipal>().principal;
    if (principal?.kind !== 'guest') throw new AppError('GUEST_SESSION_REQUIRED', 401);
    return principal;
  },
);
