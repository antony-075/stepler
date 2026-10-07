import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { RequestWithPrincipal } from '../auth/principal.js';
import { AppError } from '../errors/app-error.js';

/**
 * The operator console's routes exist only for the Stepler operator (R4): anyone else gets the
 * same `404` as an unknown route. Runs after the global `AuthGuard` (signed out → `401`, no legal
 * acceptance → `403`), which decides `kind: 'operator'` from `OPERATOR_EMAILS` and a verified
 * e-mail. No operator check lives in the user app's guards.
 */
@Injectable()
export class OperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithPrincipal>();
    if (req.principal?.kind !== 'operator') throw new AppError('NOT_FOUND', 404);
    return true;
  }
}
