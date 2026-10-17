import { describe, expect, test } from 'vitest';
import { testEnv } from '../../test/support/env.js';
import type { EntitlementResolver } from '../billing/entitlement-resolver.js';
import { LimitsService } from './limits.service.js';

// Entitlement-backed limits (`forUser`, `forCollection`) are integration-tested against the
// database (test/entitlements.e2e.spec.ts); these are the config-backed ones.
const noEntitlements = {} as EntitlementResolver;

describe('LimitsService', () => {
  test('returns config defaults', () => {
    const limits = new LimitsService(testEnv(), noEntitlements);
    expect(limits.auth()).toEqual({
      emailsPerAddressPerHour: 5,
      emailsPerIpPerHour: 20,
      tokenChecksPerIpPerHour: 60,
      loginAttemptsPerIpPerHour: 60,
      loginFailuresPerAddressIpPer15Min: 10,
      loginFailuresPerAddressPerHour: 30,
    });
    expect(limits.guestLinkResolvePerIpPerMinute()).toBe(120);
    expect(limits.guestSessionCreatePerIpPerMinute()).toBe(120);
    expect(limits.guestTextCreatePerIpPerMinute()).toBe(60);
    expect(limits.guestReadsPerIpPerMinute()).toBe(600);
    expect(limits.guestWritesPerIpPerMinute()).toBe(120);
    expect(limits.fileRules()).toEqual({
      fileBytes: { PHOTO: 50_000_000n, VIDEO: 2_000_000_000n, DOCUMENT: 50_000_000n },
      filesPerBatch: 100,
    });
    expect(limits.forGuestSession()).toEqual({
      textsPerHour: 60,
      uploadInitiationsPerHour: 300,
      concurrentUploads: 10,
      reportsPerHour: 10,
    });
    expect(limits.reportsPerIpPerHour()).toBe(60);
  });

  test('applies env overrides', () => {
    const limits = new LimitsService(
      testEnv({
        LIMIT_AUTH_EMAILS_PER_ADDRESS_PER_HOUR: '2',
        LIMIT_GUEST_LINK_RESOLVE_PER_IP_PER_MINUTE: '30',
        LIMIT_GUEST_SESSIONS_PER_IP_PER_MINUTE: '40',
        LIMIT_FILE_BYTES_VIDEO: '3000000000',
      }),
      noEntitlements,
    );
    expect(limits.guestSessionCreatePerIpPerMinute()).toBe(40);
    expect(limits.fileRules().fileBytes.VIDEO).toBe(3_000_000_000n);
    expect(limits.guestLinkResolvePerIpPerMinute()).toBe(30);
    expect(limits.auth().emailsPerAddressPerHour).toBe(2);
  });
});
