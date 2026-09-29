import type { IncomingMessage } from 'node:http';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { SKIP_ORIGIN_CHECK } from './public.decorator.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Every unsafe method must send `Origin: APP_ORIGIN`, public routes included, so a cross-site
 * page can neither act with the admin's cookie nor sign the victim into the attacker's account.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<IncomingMessage>();
    if (SAFE_METHODS.has(req.method ?? 'GET')) return true;
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_ORIGIN_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip === true) return true;
    if (req.headers.origin === this.env.APP_ORIGIN) return true;
    throw new AppError('CSRF_ORIGIN_MISMATCH', 403);
  }
}
