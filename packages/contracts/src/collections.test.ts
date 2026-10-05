import { describe, expect, test } from 'vitest';
import {
  ERROR_CODES,
  collectionSchema,
  createCollectionRequestSchema,
  listCollectionsQuerySchema,
  updateCollectionRequestSchema,
  usageResponseSchema,
} from './index.js';

describe('createCollectionRequestSchema', () => {
  test('trims the title and accepts a null description', () => {
    expect(createCollectionRequestSchema.parse({ title: '  Wedding  ' })).toEqual({
      title: 'Wedding',
    });
    expect(
      createCollectionRequestSchema.parse({ title: 'x'.repeat(100), description: null }),
    ).toEqual({ title: 'x'.repeat(100), description: null });
  });

  test('rejects blank or too long titles and extra keys', () => {
    for (const title of ['', '   ', 'x'.repeat(101)]) {
      expect(createCollectionRequestSchema.safeParse({ title }).success).toBe(false);
    }
    expect(createCollectionRequestSchema.safeParse({ title: 'A', ownerId: 'x' }).success).toBe(
      false,
    );
  });

  test('limits the description to 1000 characters', () => {
    expect(
      createCollectionRequestSchema.safeParse({ title: 'A', description: 'x'.repeat(1000) })
        .success,
    ).toBe(true);
    expect(
      createCollectionRequestSchema.safeParse({ title: 'A', description: 'x'.repeat(1001) })
        .success,
    ).toBe(false);
  });
});

describe('control characters', () => {
  // PostgreSQL text rejects NUL, so it must be a 400 here rather than a 500 from the database.
  test('the title rejects every C0 control character, line breaks and tabs included', () => {
    for (const title of ['A\u0000B', 'A\u0007B', 'A\u001bB', 'A\nB', 'A\rB', 'A\tB']) {
      expect(createCollectionRequestSchema.safeParse({ title }).success).toBe(false);
      expect(updateCollectionRequestSchema.safeParse({ title }).success).toBe(false);
    }
  });

  test('the description keeps line breaks and tabs but rejects other C0 characters', () => {
    expect(
      createCollectionRequestSchema.parse({ title: 'A', description: 'Line 1\r\nLine 2\tend' })
        .description,
    ).toBe('Line 1\r\nLine 2\tend');
    for (const description of ['A\u0000B', 'A\u0007B', 'A\u001bB', 'A\u001fB']) {
      expect(createCollectionRequestSchema.safeParse({ title: 'A', description }).success).toBe(
        false,
      );
      expect(updateCollectionRequestSchema.safeParse({ description }).success).toBe(false);
    }
  });
});

describe('updateCollectionRequestSchema', () => {
  test('accepts partial updates, null clears the description, rejects status', () => {
    expect(updateCollectionRequestSchema.parse({ description: null })).toEqual({
      description: null,
    });
    expect(updateCollectionRequestSchema.parse({})).toEqual({});
    expect(updateCollectionRequestSchema.safeParse({ title: '' }).success).toBe(false);
    expect(updateCollectionRequestSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
  });

  test('the welcome message is not part of it any more (the guest page draft has it)', () => {
    expect(updateCollectionRequestSchema.safeParse({ welcomeMessage: 'Вітаємо!' }).success).toBe(
      false,
    );
  });
});

describe('listCollectionsQuerySchema', () => {
  test('defaults to active collections, 50 per page', () => {
    expect(listCollectionsQuerySchema.parse({})).toEqual({ status: 'ACTIVE', limit: 50 });
    expect(listCollectionsQuerySchema.parse({ limit: '20' }).limit).toBe(20);
  });

  test('rejects out-of-range limits and the internal DELETING status', () => {
    expect(listCollectionsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(listCollectionsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(listCollectionsQuerySchema.safeParse({ status: 'DELETING' }).success).toBe(false);
  });
});

describe('collectionSchema', () => {
  const collection = {
    id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
    title: 'Wedding',
    description: null,
    status: 'ACTIVE',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    archivedAt: null,
    defaultLinkStatus: 'ACTIVE',
    defaultLinkPermissions: {
      canUploadPhotos: true,
      canUploadVideos: true,
      canUploadDocuments: true,
      canSubmitText: true,
      canViewGallery: false,
      canDeleteOwn: true,
    },
    contentCount: 0,
    lastContentAt: null,
    welcomeMessage: null,
    cover: null,
    image: null,
  };

  test('accepts a collection', () => {
    expect(collectionSchema.parse(collection)).toEqual(collection);
  });

  test('carries the welcome message and the cover, both required and nullable', () => {
    const withCover = {
      ...collection,
      welcomeMessage: 'Вітаємо!',
      cover: {
        id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
        status: 'READY',
        thumbnailUrl: 'https://storage.example.com/t.webp',
        previewUrl: 'https://storage.example.com/p.webp',
        largeUrl: null,
        width: 4000,
        height: 3000,
      },
    };
    expect(collectionSchema.parse(withCover)).toEqual(withCover);
    const withoutImage: Partial<typeof collection> = { ...collection };
    delete withoutImage.image;
    expect(collectionSchema.safeParse(withoutImage).success).toBe(false);
    const withoutCover: Partial<typeof collection> = { ...collection };
    delete withoutCover.cover;
    expect(collectionSchema.safeParse(withoutCover).success).toBe(false);
    const withoutWelcome: Partial<typeof collection> = { ...collection };
    delete withoutWelcome.welcomeMessage;
    expect(collectionSchema.safeParse(withoutWelcome).success).toBe(false);
  });

  test('carries the frame count and the newest frame time', () => {
    const withContent = {
      ...collection,
      contentCount: 3,
      lastContentAt: '2026-10-03T21:10:00.000Z',
    };
    expect(collectionSchema.parse(withContent)).toEqual(withContent);
    expect(collectionSchema.safeParse({ ...collection, contentCount: -1 }).success).toBe(false);
    const withoutCount: Partial<typeof collection> = { ...collection };
    delete withoutCount.contentCount;
    expect(collectionSchema.safeParse(withoutCount).success).toBe(false);
  });

  test('defaultLinkStatus is ACTIVE, INACTIVE or null (no live default yet)', () => {
    expect(collectionSchema.safeParse({ ...collection, defaultLinkStatus: null }).success).toBe(
      true,
    );
    expect(
      collectionSchema.safeParse({ ...collection, defaultLinkStatus: 'INACTIVE' }).success,
    ).toBe(true);
    expect(
      collectionSchema.safeParse({ ...collection, defaultLinkStatus: 'REVOKED' }).success,
    ).toBe(false);
  });

  test("defaultLinkPermissions are the live default link's permissions, or null without one", () => {
    expect(
      collectionSchema.safeParse({ ...collection, defaultLinkPermissions: null }).success,
    ).toBe(true);
    // The same rules as a link's own permissions: a link that allows nothing is not valid.
    expect(
      collectionSchema.safeParse({
        ...collection,
        defaultLinkPermissions: {
          canUploadPhotos: false,
          canUploadVideos: false,
          canUploadDocuments: false,
          canSubmitText: false,
          canViewGallery: false,
          canDeleteOwn: false,
        },
      }).success,
    ).toBe(false);
    expect(
      collectionSchema.safeParse({ ...collection, defaultLinkPermissions: undefined }).success,
    ).toBe(false);
  });

  test('rejects DELETING and internal fields', () => {
    expect(collectionSchema.safeParse({ ...collection, status: 'DELETING' }).success).toBe(false);
    expect(collectionSchema.safeParse({ ...collection, ownerId: collection.id }).success).toBe(
      false,
    );
  });
});

describe('usageResponseSchema', () => {
  test('accepts active-collection and storage usage and rejects extra keys', () => {
    const usage = {
      activeCollections: { used: 1, limit: 3 },
      storage: { usedBytes: 1_200_000_000, limitBytes: 21_474_836_480 },
    };
    expect(usageResponseSchema.parse(usage)).toEqual(usage);
    expect(usageResponseSchema.safeParse({ ...usage, extra: 1 }).success).toBe(false);
    expect(usageResponseSchema.safeParse({ ...usage, storage: {} }).success).toBe(false);
    expect(
      usageResponseSchema.safeParse({ activeCollections: usage.activeCollections }).success,
    ).toBe(false);
  });
});

test('ERROR_CODES contains COLLECTION_LIMIT_REACHED', () => {
  expect(ERROR_CODES).toContain('COLLECTION_LIMIT_REACHED');
});
