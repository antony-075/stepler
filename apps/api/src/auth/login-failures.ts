import { Injectable } from '@nestjs/common';

interface Window {
  count: number;
  resetsAt: number;
}

/**
 * Failed sign-ins per key in fixed windows (ADR 0019), in memory and per instance like the other
 * limits (spec §21). Only failures count, so a person who types the right password is never
 * slowed down by their own earlier typos once the window ends.
 */
@Injectable()
export class LoginFailures {
  private readonly windows = new Map<string, Window>();

  /** Seconds until the key may try again, or `null` when it may now. */
  blockedFor(key: string, limit: number, now = Date.now()): number | null {
    const window = this.current(key, now);
    if (window === undefined || window.count < limit) return null;
    return Math.max(1, Math.ceil((window.resetsAt - now) / 1000));
  }

  record(key: string, windowMs: number, now = Date.now()): void {
    const window = this.current(key, now);
    if (window === undefined) this.windows.set(key, { count: 1, resetsAt: now + windowMs });
    else window.count += 1;
    if (this.windows.size > 50_000) this.sweep(now);
  }

  clear(key: string): void {
    this.windows.delete(key);
  }

  private current(key: string, now: number): Window | undefined {
    const window = this.windows.get(key);
    if (window === undefined) return undefined;
    if (window.resetsAt <= now) {
      this.windows.delete(key);
      return undefined;
    }
    return window;
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) if (window.resetsAt <= now) this.windows.delete(key);
  }
}
