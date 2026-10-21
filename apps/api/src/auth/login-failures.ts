import { Injectable } from '@nestjs/common';
import { RateLimitStore } from '../limits/rate-limit-store.js';

/**
 * Failed sign-ins per key in fixed windows (ADR 0019), shared by every API instance through
 * `RateLimitStore` (spec §21). Only failures count, so a person who types the right password is
 * never slowed down by their own earlier typos once the window ends.
 */
@Injectable()
export class LoginFailures {
  constructor(private readonly store: RateLimitStore) {}

  /** Seconds until the key may try again, or `null` when it may now. */
  blockedFor(key: string, limit: number): Promise<number | null> {
    return this.store.blockedFor(`login-failures:${key}`, limit);
  }

  record(key: string, windowMs: number): Promise<void> {
    return this.store.record(`login-failures:${key}`, windowMs);
  }

  clear(key: string): Promise<void> {
    return this.store.clear(`login-failures:${key}`);
  }
}
