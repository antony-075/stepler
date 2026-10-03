import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import type { AccountPrincipal, RequestWithPrincipal } from './principal.js';
import { IS_PUBLIC } from './public.decorator.js';
import { type ResolvedSession, SessionService } from './session.service.js';
import { readCookie, SESSION_COOKIE } from './session-cookie.js';

/** Default deny: every route needs a valid admin session unless marked `@Public()`. */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly operatorEmails: ReadonlySet<string>;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.operatorEmails = new Set(env.OPERATOR_EMAILS);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const req = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const token = readCookie(req, SESSION_COOKIE);
    const session = token === undefined ? null : await this.sessions.resolve(token);
    if (session === null) throw new AppError('UNAUTHENTICATED', 401);
    req.principal = this.toPrincipal(session);
    return true;
  }

  /** An operator is a verified admin whose email is configured in OPERATOR_EMAILS (ADR 0013). */
  private toPrincipal(session: ResolvedSession): AccountPrincipal {
    const isOperator =
      session.emailVerifiedAt !== null && this.operatorEmails.has(session.email.toLowerCase());
    return { kind: isOperator ? 'operator' : 'admin', userId: session.userId };
  }
}
