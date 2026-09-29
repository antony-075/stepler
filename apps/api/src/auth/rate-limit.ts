import type { ServerResponse } from 'node:http';
import { type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { AppError } from '../errors/app-error.js';
import type { LimitsService } from '../limits/limits.service.js';

/** Named per-IP limits. A route opts into exactly one with `@RateLimit(name)`. */
export type RateLimitName = 'magic-link' | 'magic-link-preview';

const RATE_LIMIT = 'stepler:rateLimit';
const HOUR_MS = 3600_000;

export const RateLimit = (name: RateLimitName): MethodDecorator => SetMetadata(RATE_LIMIT, name);

function routeLimit(context: ExecutionContext): unknown {
  return Reflect.getMetadata(RATE_LIMIT, context.getHandler());
}

/**
 * In-memory, per IP (`req.ip`, so `API_TRUST_PROXY` matters). Single-instance only; shared
 * storage is an open decision for multi-instance deployments (spec §21).
 */
export function throttlerOptions(limits: LimitsService): ThrottlerModuleOptions {
  const { perIpPerHour, previewPerIpPerHour } = limits.magicLink();
  const named = (name: RateLimitName, limit: number) => ({
    name,
    ttl: HOUR_MS,
    limit,
    skipIf: (context: ExecutionContext) => routeLimit(context) !== name,
  });
  return {
    throttlers: [
      named('magic-link', perIpPerHour),
      named('magic-link-preview', previewPerIpPerHour),
    ],
    setHeaders: false,
  };
}

/** Applies the route's named limit; a breach is `429 RATE_LIMITED` with a standard Retry-After. */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const res = context.switchToHttp().getResponse<ServerResponse>();
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(detail.timeToBlockExpire))));
    throw new AppError('RATE_LIMITED', 429, { retryable: true });
  }
}
