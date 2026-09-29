import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

/** Injection token for the `TurnstileVerifier` port. */
export const TURNSTILE_VERIFIER = Symbol('TURNSTILE_VERIFIER');

/** Server-side verification of a Turnstile token (ADR 0012). */
export interface TurnstileVerifier {
  /** `false` for an invalid token; throws `DEPENDENCY_UNAVAILABLE` when Cloudflare can't answer. */
  verify(token: string, remoteIp?: string): Promise<boolean>;
}

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5000;
/** Cloudflare documents tokens of at most 2048 characters. */
const MAX_TOKEN_LENGTH = 2048;

const siteverifyResponseSchema = z.object({ success: z.boolean() });

@Injectable()
export class CloudflareTurnstileVerifier implements TurnstileVerifier {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  async verify(token: string, remoteIp?: string): Promise<boolean> {
    if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return false;
    const body = new URLSearchParams({ secret: this.env.TURNSTILE_SECRET_KEY, response: token });
    if (remoteIp !== undefined) body.set('remoteip', remoteIp);

    // Fail closed: any failure to get a definite answer is an error, never a pass.
    try {
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`siteverify responded ${res.status}`);
      return siteverifyResponseSchema.parse(await res.json()).success;
    } catch (cause) {
      throw new AppError('DEPENDENCY_UNAVAILABLE', 503, { retryable: true, cause });
    }
  }
}
