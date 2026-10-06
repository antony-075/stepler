import { describe, expect, test } from 'vitest';
import {
  adminContentDetailSchema,
  adminContentItemSchema,
  adminContentListQuerySchema,
  bulkDeleteContentRequestSchema,
  codePointLength,
  ERROR_CODES,
  guestContentDetailSchema,
  guestContentItemSchema,
  guestContentListQuerySchema,
  guestNameSchema,
  textBodySchema,
} from './index.js';

const id = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';

describe('codePointLength', () => {
  test('counts an emoji as one, like PostgreSQL char_length', () => {
    expect('😀'.length).toBe(2);
    expect(codePointLength('😀')).toBe(1);
    expect(codePointLength('Ірина')).toBe(5);
  });
});

describe('textBodySchema', () => {
  test('trims leading and trailing whitespace', () => {
    expect(textBodySchema.parse('  привіт \n')).toBe('привіт');
  });

  test('allows 5000 code points, not 5001 (10 000 UTF-16 units pass)', () => {
    expect(textBodySchema.safeParse('😀'.repeat(5000)).success).toBe(true);
    expect(textBodySchema.safeParse('😀'.repeat(5001)).success).toBe(false);
    expect(textBodySchema.safeParse('a'.repeat(5001)).success).toBe(false);
  });

  test('keeps line breaks and tabs, rejects other control characters', () => {
    expect(textBodySchema.parse('a\nb\tc')).toBe('a\nb\tc');
    expect(textBodySchema.safeParse('a\u0000b').success).toBe(false);
    expect(textBodySchema.safeParse('a\u0007b').success).toBe(false);
  });

  test('rejects empty and blank text', () => {
    expect(textBodySchema.safeParse('').success).toBe(false);
    expect(textBodySchema.safeParse('   ').success).toBe(false);
  });
});

describe('guestNameSchema', () => {
  test('allows 80 code points, not 81', () => {
    expect(guestNameSchema.safeParse('я'.repeat(80)).success).toBe(true);
    expect(guestNameSchema.safeParse('я'.repeat(81)).success).toBe(false);
    expect(guestNameSchema.safeParse('😀'.repeat(80)).success).toBe(true);
  });

  test('trims, and rejects control characters and line breaks inside', () => {
    expect(guestNameSchema.parse('Ірина\n')).toBe('Ірина');
    expect(guestNameSchema.safeParse('Ір\u0007ина').success).toBe(false);
    expect(guestNameSchema.safeParse('Ір\nина').success).toBe(false);
    expect(guestNameSchema.safeParse('  ').success).toBe(false);
  });
});

const media = { thumbnailUrl: null, previewUrl: null, posterUrl: null };

describe('adminContentItemSchema', () => {
  const item = {
    id,
    frameNo: 86,
    kind: 'TEXT',
    createdAt: '2026-10-03T21:10:00.000Z',
    contributorName: 'Ірина',
    originalFilename: null,
    mimeType: null,
    sizeBytes: null,
    width: null,
    height: null,
    durationMs: null,
    processingStatus: 'NOT_REQUIRED',
    text: 'Вітаємо!',
    ...media,
    moderation: { hidden: null, openReports: 0 },
  };

  test('accepts a text frame; the detail adds original and download links', () => {
    expect(adminContentItemSchema.parse(item)).toEqual(item);
    const detail = { ...item, originalUrl: null, downloadUrl: null };
    expect(adminContentDetailSchema.parse(detail)).toEqual(detail);
    expect(adminContentItemSchema.safeParse({ ...item, frameNo: 0 }).success).toBe(false);
    expect(adminContentItemSchema.safeParse({ ...item, deletedAt: null }).success).toBe(false);
  });

  test('carries its moderation state (slice 9)', () => {
    const hidden = {
      ...item,
      moderation: {
        hidden: { by: 'OPERATOR', at: '2026-10-06T10:00:00.000Z', reason: 'Спам' },
        openReports: 2,
      },
    };
    expect(adminContentItemSchema.parse(hidden)).toEqual(hidden);
    const withoutModeration: Partial<typeof item> = { ...item };
    delete withoutModeration.moderation;
    expect(adminContentItemSchema.safeParse(withoutModeration).success).toBe(false);
  });
});

describe('guestContentItemSchema', () => {
  const own = {
    id,
    kind: 'TEXT',
    createdAt: '2026-10-03T21:10:00.000Z',
    isOwn: true,
    frameNo: 12,
    canDelete: false,
    originalFilename: null,
    sizeBytes: null,
    width: null,
    height: null,
    durationMs: null,
    processingStatus: 'NOT_REQUIRED',
    text: 'Вітаємо!',
    ...media,
  };

  test('own frames carry their number, foreign frames none (ADR 0015)', () => {
    expect(guestContentItemSchema.parse(own)).toEqual(own);
    const foreign = { ...own, isOwn: false, frameNo: null };
    expect(guestContentItemSchema.parse(foreign)).toEqual(foreign);
    expect(guestContentItemSchema.safeParse({ ...own, isOwn: false, frameNo: 12 }).success).toBe(
      false,
    );
    expect(guestContentItemSchema.safeParse({ ...own, frameNo: null }).success).toBe(false);
  });

  test("other guests' file names stay private (spec §8)", () => {
    const file = { ...own, kind: 'DOCUMENT', text: null, originalFilename: 'Program.pdf' };
    expect(guestContentItemSchema.safeParse(file).success).toBe(true);
    expect(guestContentItemSchema.safeParse({ ...file, isOwn: false, frameNo: null }).success).toBe(
      false,
    );
    expect(
      guestContentItemSchema.safeParse({
        ...file,
        isOwn: false,
        frameNo: null,
        originalFilename: null,
      }).success,
    ).toBe(true);
  });

  test('never carries admin fields [C16]', () => {
    for (const extra of [
      { contributorName: 'Ірина' },
      { contributorGuestSessionId: id },
      { mimeType: 'image/jpeg' },
    ]) {
      expect(guestContentItemSchema.safeParse({ ...own, ...extra }).success).toBe(false);
    }
  });

  test('the detail follows the same number rule', () => {
    const detail = { ...own, originalUrl: null, downloadUrl: null };
    expect(guestContentDetailSchema.parse(detail)).toEqual(detail);
    expect(
      guestContentDetailSchema.safeParse({ ...detail, isOwn: false, frameNo: 12 }).success,
    ).toBe(false);
  });
});

describe('list queries', () => {
  test('admin: newest first, 48 per page by default', () => {
    expect(adminContentListQuerySchema.parse({})).toEqual({ sort: 'newest', limit: 48 });
    expect(
      adminContentListQuerySchema.parse({ kind: 'TEXT', sort: 'frame', limit: '100' }),
    ).toEqual({ kind: 'TEXT', sort: 'frame', limit: 100 });
    expect(adminContentListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(adminContentListQuerySchema.safeParse({ kind: 'AUDIO' }).success).toBe(false);
    // «Скарги» (slice 9): only the literal `true`.
    expect(adminContentListQuerySchema.parse({ reported: 'true' })).toMatchObject({
      reported: 'true',
    });
    expect(adminContentListQuerySchema.safeParse({ reported: '1' }).success).toBe(false);
  });

  test('guest: the scope is required', () => {
    expect(guestContentListQuerySchema.parse({ scope: 'own' })).toEqual({
      scope: 'own',
      limit: 48,
    });
    expect(guestContentListQuerySchema.safeParse({}).success).toBe(false);
    expect(guestContentListQuerySchema.safeParse({ scope: 'mine' }).success).toBe(false);
  });
});

describe('bulkDeleteContentRequestSchema', () => {
  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => `01a0ee76-0574-7fe5-a38b-${String(i).padStart(12, '0')}`);

  test('1 to 100 unique ids', () => {
    expect(bulkDeleteContentRequestSchema.safeParse({ ids: ids(1) }).success).toBe(true);
    expect(bulkDeleteContentRequestSchema.safeParse({ ids: ids(100) }).success).toBe(true);
    expect(bulkDeleteContentRequestSchema.safeParse({ ids: ids(101) }).success).toBe(false);
    expect(bulkDeleteContentRequestSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  test('rejects duplicates', () => {
    expect(bulkDeleteContentRequestSchema.safeParse({ ids: [id, id] }).success).toBe(false);
    expect(bulkDeleteContentRequestSchema.safeParse({ ids: [id, id.toUpperCase()] }).success).toBe(
      false,
    );
  });
});

test('ERROR_CODES contains the guest content and upload codes', () => {
  for (const code of [
    'GUEST_SESSION_REQUIRED',
    'QUOTA_EXCEEDED',
    'FILE_TYPE_NOT_ALLOWED',
    'FILE_TOO_LARGE',
    'UPLOAD_SIZE_MISMATCH',
    'UPLOAD_INCOMPLETE',
    'UPLOAD_EXPIRED',
    'UPLOAD_CLOSED',
    'IDEMPOTENCY_CONFLICT',
    'CONTENT_NOT_FOUND',
  ]) {
    expect(ERROR_CODES).toContain(code);
  }
});
