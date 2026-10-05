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
  },
  page: {
    templateId: 'classic',
    templateVersion: 1,
    settings: {
      background: { kind: 'solid', color: '#F0F1EE' },
      accent: '#B83E26',
      headingFont: 'geologica',
      coverPlacement: 'top',
      align: 'start',
      corners: 'soft',
    },
    welcomeMessage: null,
    cover: null,
    background: null,
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

  test('the published page: welcome and READY images, never a draft, revision or status', () => {
    const cover = {
      thumbnailUrl: 'https://storage.example.com/t.webp',
      previewUrl: 'https://storage.example.com/p.webp',
      largeUrl: null,
      width: 4000,
      height: 3000,
    };
    const withPage = {
      ...context,
      page: { ...context.page, welcomeMessage: 'Дякуємо, що ви з нами!', cover },
    };
    expect(guestContextSchema.parse(withPage)).toEqual(withPage);
    for (const page of [
      { ...context.page, draft: null },
      { ...context.page, revision: 2 },
      { ...context.page, background: { ...cover, status: 'READY' } },
      { ...context.page, cover: { ...cover, sourceContentItemId: context.collection.id } },
    ]) {
      expect(guestContextSchema.safeParse({ ...context, page }).success).toBe(false);
    }
  });

  test('the collection no longer carries the cover or the welcome (they are the page’s)', () => {
    for (const extra of [{ cover: null }, { welcomeMessage: null }]) {
      expect(
        guestContextSchema.safeParse({
          ...context,
          collection: { ...context.collection, ...extra },
        }).success,
      ).toBe(false);
    }
    const withoutPage: Record<string, unknown> = { ...context };
    delete withoutPage.page;
    expect(guestContextSchema.safeParse(withoutPage).success).toBe(false);
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
