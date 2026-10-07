import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { OperatorPrincipal, RequestWithPrincipal } from '../auth/principal.js';
import { AppError } from '../errors/app-error.js';

/** The operator `OperatorGuard` let through; anyone else is `404` here too. */
export const CurrentOperator = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OperatorPrincipal => {
    const principal = context.switchToHttp().getRequest<RequestWithPrincipal>().principal;
    if (principal?.kind !== 'operator') throw new AppError('NOT_FOUND', 404);
    return principal;
  },
);
