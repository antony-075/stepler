import { describe, expect, test } from 'vitest';
import { testEnv } from '../../test/support/env.js';
import { LimitsService } from './limits.service.js';

describe('LimitsService', () => {
  test('returns config defaults', () => {
    const limits = new LimitsService(testEnv());
    expect(limits.magicLink()).toEqual({
      perEmailPerHour: 5,
      perIpPerHour: 20,
      previewPerIpPerHour: 60,
    });
    expect(limits.forUser({ id: 'u1' })).toEqual({
      activeCollections: 3,
      collectionCreationsPerDay: 10,
      storageBytes: 20n * 1024n ** 3n,
    });
    expect(limits.forCollection({ id: 'c1' })).toEqual({
      storageBytes: 10n * 1024n ** 3n,
      guestLinks: 10,
    });
  });

  test('applies env overrides', () => {
    const limits = new LimitsService(
      testEnv({
        LIMIT_MAGIC_LINK_PER_EMAIL_PER_HOUR: '2',
        LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT: '7',
        LIMIT_STORAGE_BYTES_PER_ACCOUNT: '1000',
        LIMIT_COLLECTION_CREATIONS_PER_DAY: '4',
        LIMIT_GUEST_LINKS_PER_COLLECTION: '2',
      }),
    );
    expect(limits.forCollection({ id: 'c1' }).guestLinks).toBe(2);
    expect(limits.magicLink().perEmailPerHour).toBe(2);
    expect(limits.forUser({ id: 'u1' })).toEqual({
      activeCollections: 7,
      collectionCreationsPerDay: 4,
      storageBytes: 1000n,
    });
  });
});
