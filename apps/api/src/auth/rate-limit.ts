import type { ServerResponse } from 'node:http';
import { type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { AppError } from '../errors/app-error.js';
import type { LimitsService } from '../limits/limits.service.js';

/**
 * Named per-IP limits enforced by `RateLimitGuard`; a route opts into one with `@RateLimit`.
 * The magic-link request limit is not here: it is counted only after Turnstile passes
 * (`MagicLinkService`), so junk requests cannot use it up for everyone behind one IP.
 */
export type RateLimitName = 'magic-link-preview' | 'guest-link-resolve';

const RATE_LIMIT = 'stepler:rateLimit';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const RateLimit = (name: RateLimitName): MethodDecorator => SetMetadata(RATE_LIMIT, name);

function routeLimit(context: ExecutionContext): unknown {
  return Reflect.getMetadata(RATE_LIMIT, context.getHandler());
}

/**
 * In-memory, per IP (`req.ip`, so `API_TRUST_PROXY` matters). Single-instance only; shared
 * storage is an open decision for multi-instance deployments (spec §21).
 */
export function throttlerOptions(limits: LimitsService): ThrottlerModuleOptions {
  const { previewPerIpPerHour } = limits.magicLink();
  const named = (name: RateLimitName, limit: number, ttl: number) => ({
    name,
    ttl,
    limit,
    skipIf: (context: ExecutionContext) => routeLimit(context) !== name,
  });
  return {
    throttlers: [
      named('magic-link-preview', previewPerIpPerHour, HOUR_MS),
      // Bounds load, not guessing (a token has 256 bits). Guests behind one venue NAT share an IP,
      // hence the generous default [G10].
      named('guest-link-resolve', limits.guestLinkResolvePerIpPerMinute(), MINUTE_MS),
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
