import type { IncomingMessage, ServerResponse } from 'node:http';
import { type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { AppError } from '../errors/app-error.js';
import { GUEST_SESSION_COOKIE } from '../guest-access/guest-session-cookie.js';
import type { LimitsService } from '../limits/limits.service.js';
import type { RequestWithPrincipal } from './principal.js';
import { readCookie } from './session-cookie.js';
import { hashToken } from './tokens.js';

/**
 * Named per-IP limits enforced by `RateLimitGuard`; a route opts into one with `@RateLimit`.
 * The account-mail limit is not here: it is counted only after Turnstile passes
 * (`PasswordAuthService`), so junk requests cannot use it up for everyone behind one IP; nor are
 * the sign-in failure limits, counted per address after a failed check.
 */
export type RateLimitName =
  | 'auth-token'
  | 'auth-login'
  | 'guest-link-resolve'
  | 'guest-session-create'
  | 'guest-text-create'
  | 'guest-read'
  | 'guest-write'
  | 'guest-report'
  | 'guest-upload'
  | 'guest-upload-session'
  | 'admin-cover'
  | 'admin-cover-user'
  | 'billing-callback'
  | 'billing-checkout';

const RATE_LIMIT = 'stepler:rateLimit';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** The route's named limits; several apply together (e.g. per IP and per guest session). */
export const RateLimit = (...names: RateLimitName[]): MethodDecorator =>
  SetMetadata(RATE_LIMIT, names);

function routeLimits(context: ExecutionContext): readonly unknown[] {
  const names: unknown = Reflect.getMetadata(RATE_LIMIT, context.getHandler());
  return Array.isArray(names) ? names : [];
}

/**
 * Counts per guest session: the hash of the `st_gs` cookie (never the raw token), or the IP when
 * there is none (the guard then refuses the request anyway). Runs before the session guard, so
 * a flood is refused before any session lookup.
 */
function guestSessionTracker(req: Record<string, unknown>): string {
  const cookie = readCookie(req as unknown as IncomingMessage, GUEST_SESSION_COOKIE);
  return cookie === undefined ? `ip:${String(req.ip)}` : `gs:${hashToken(cookie)}`;
}

/**
 * Counts per signed-in user. The global `AuthGuard` runs before route guards, so the principal is
 * set by the time this runs on an admin route; without one (never, on those routes) the IP.
 */
function adminUserTracker(req: Record<string, unknown>): string {
  const principal = (req as unknown as RequestWithPrincipal).principal;
  return principal === undefined || principal.kind === 'guest'
    ? `ip:${String(req.ip)}`
    : `user:${principal.userId}`;
}

/**
 * In-memory, per IP (`req.ip`, so `API_TRUST_PROXY` matters). Single-instance only; shared
 * storage is an open decision for multi-instance deployments (spec §21).
 */
export function throttlerOptions(limits: LimitsService): ThrottlerModuleOptions {
  const auth = limits.auth();
  const named = (name: RateLimitName, limit: number, ttl: number) => ({
    name,
    ttl,
    limit,
    skipIf: (context: ExecutionContext) => !routeLimits(context).includes(name),
  });
  return {
    throttlers: [
      // Mailed links (preview, confirm, reset): bounds load, a token has 256 bits.
      named('auth-token', auth.tokenChecksPerIpPerHour, HOUR_MS),
      // Sign-in attempts per IP, before any password is checked (ADR 0019).
      named('auth-login', auth.loginAttemptsPerIpPerHour, HOUR_MS),
      // Bounds load, not guessing (a token has 256 bits). Guests behind one venue NAT share an IP,
      // hence the generous default [G10].
      named('guest-link-resolve', limits.guestLinkResolvePerIpPerMinute(), MINUTE_MS),
      named('guest-session-create', limits.guestSessionCreatePerIpPerMinute(), MINUTE_MS),
      named('guest-text-create', limits.guestTextCreatePerIpPerMinute(), MINUTE_MS),
      // Counted per route (the throttler keys by handler): context, content list, one item.
      named('guest-read', limits.guestReadsPerIpPerMinute(), MINUTE_MS),
      // Guest deletes of their own frames [C15] and name changes, per route.
      named('guest-write', limits.guestWritesPerIpPerMinute(), MINUTE_MS),
      // Guest reports (slice 9): per IP per hour, across sessions (the per-session hourly limit
      // is counted from rows by `ReportsService`).
      named('guest-report', limits.reportsPerIpPerHour(), HOUR_MS),
      // Upload calls (review I2), per route: per IP, and per guest session.
      named('guest-upload', limits.uploadCallsPerIpPerMinute(), MINUTE_MS),
      {
        ...named('guest-upload-session', limits.uploadCallsPerGuestSessionPerMinute(), MINUTE_MS),
        getTracker: guestSessionTracker,
      },
      // The admin's cover routes, per route: per IP, and per signed-in user.
      named('admin-cover', limits.coverCallsPerIpPerMinute(), MINUTE_MS),
      {
        ...named('admin-cover-user', limits.coverCallsPerUserPerMinute(), MINUTE_MS),
        getTracker: adminUserTracker,
      },
      // Billing (ADR 0018): LiqPay's callback per IP; checkouts per signed-in account per hour.
      named('billing-callback', limits.billingCallbacksPerIpPerMinute(), MINUTE_MS),
      {
        ...named('billing-checkout', limits.billingCheckoutsPerUserPerHour(), HOUR_MS),
        getTracker: adminUserTracker,
      },
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
