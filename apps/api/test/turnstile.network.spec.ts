import { describe, expect, test } from 'vitest';
import { CloudflareTurnstileVerifier } from '../src/turnstile/turnstile-verifier.js';
import { testEnv } from './support/env.js';

// Calls Cloudflare. Opt-in: RUN_NETWORK_TESTS=1. Uses Cloudflare's documented test secrets.
describe.runIf(process.env.RUN_NETWORK_TESTS === '1')('Turnstile siteverify @network', () => {
  test('the always-pass test secret accepts a dummy token', async () => {
    const verifier = new CloudflareTurnstileVerifier(
      testEnv({ TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' }),
    );
    expect(await verifier.verify('XXXX.DUMMY.TOKEN.XXXX')).toBe(true);
  });

  test('the always-fail test secret rejects it', async () => {
    const verifier = new CloudflareTurnstileVerifier(
      testEnv({ TURNSTILE_SECRET_KEY: '2x0000000000000000000000000000000AA' }),
    );
    expect(await verifier.verify('XXXX.DUMMY.TOKEN.XXXX')).toBe(false);
  });
});
