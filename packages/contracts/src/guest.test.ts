import { describe, expect, test } from 'vitest';
import {
  guestContextSchema,
  guestSessionRequestSchema,
  updateGuestSessionRequestSchema,
} from './index.js';

const context = {
  collection: {
    id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
    title: 'Wedding',
    description: null,
    welcomeMessage: null,
    cover: null,
  },
  permissions: {
    canUploadPhotos: true,
    canUploadVideos: true,
    canUploadDocuments: false,
    canSubmitText: true,
    canViewGallery: true,
    canDeleteOwn: true,
  },
  guest: { name: null, nameAnswered: false },
  limits: {
    maxFileBytes: { photo: 50_000_000, video: 2_000_000_000, document: 50_000_000 },
    filesPerBatch: 100,
    textMaxChars: 5000,
  },
  counts: { total: 86, lastAddedAt: '2026-10-03T21:10:00.000Z' },
};

describe('guestContextSchema', () => {
  test('accepts a context; counts are null without the shared gallery', () => {
    expect(guestContextSchema.parse(context)).toEqual(context);
    expect(guestContextSchema.safeParse({ ...context, counts: null }).success).toBe(true);
  });

  test('carries the welcome message and a READY cover, never the cover status or source frame', () => {
    const cover = {
      thumbnailUrl: 'https://storage.example.com/t.webp',
      previewUrl: 'https://storage.example.com/p.webp',
      width: 4000,
      height: 3000,
    };
    const withCover = {
      ...context,
      collection: { ...context.collection, welcomeMessage: 'Дякуємо, що ви з нами!', cover },
    };
    expect(guestContextSchema.parse(withCover)).toEqual(withCover);
    for (const extra of [
      { status: 'READY' },
      { sourceContentItemId: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9' },
    ]) {
      expect(
        guestContextSchema.safeParse({
          ...context,
          collection: { ...context.collection, cover: { ...cover, ...extra } },
        }).success,
      ).toBe(false);
    }
    const withoutCover: Record<string, unknown> = { ...context.collection };
    delete withoutCover.cover;
    expect(guestContextSchema.safeParse({ ...context, collection: withoutCover }).success).toBe(
      false,
    );
  });

  test('never carries the session id', () => {
    const guestSessionId = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
    expect(guestContextSchema.safeParse({ ...context, guestSessionId }).success).toBe(false);
    expect(
      guestContextSchema.safeParse({ ...context, guest: { ...context.guest, guestSessionId } })
        .success,
    ).toBe(false);
  });
});

describe('guestSessionRequestSchema', () => {
  test('a link token of 1 to 200 characters, nothing else', () => {
    expect(guestSessionRequestSchema.safeParse({ linkToken: 'x' }).success).toBe(true);
    expect(guestSessionRequestSchema.safeParse({ linkToken: '' }).success).toBe(false);
    expect(guestSessionRequestSchema.safeParse({ linkToken: 'x'.repeat(201) }).success).toBe(false);
    expect(guestSessionRequestSchema.safeParse({ linkToken: 'x', extra: 1 }).success).toBe(false);
  });
});

describe('updateGuestSessionRequestSchema', () => {
  test('a name, or null to skip or clear it', () => {
    expect(updateGuestSessionRequestSchema.parse({ name: ' Ірина ' })).toEqual({ name: 'Ірина' });
    expect(updateGuestSessionRequestSchema.parse({ name: null })).toEqual({ name: null });
    expect(updateGuestSessionRequestSchema.safeParse({}).success).toBe(false);
    expect(updateGuestSessionRequestSchema.safeParse({ name: '' }).success).toBe(false);
  });
});
