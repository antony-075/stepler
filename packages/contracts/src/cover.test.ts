import { describe, expect, test } from 'vitest';
import {
  collectionCoverSchema,
  collectionDescriptionSchema,
  collectionTitleSchema,
  displayNameSchema,
  collectionWelcomeMessageSchema,
  coverUploadParamsSchema,
  ERROR_CODES,
  guestCoverSchema,
  setCoverFromFrameRequestSchema,
  WELCOME_MESSAGE_MAX_CHARS,
} from './index.js';

const URL_A = 'https://storage.example.com/cover/thumbnail.webp?X-Amz-Signature=a';
const URL_B = 'https://storage.example.com/cover/preview.webp?X-Amz-Signature=b';

describe('collectionWelcomeMessageSchema', () => {
  test('trims and keeps one paragraph of up to 160 code points', () => {
    expect(collectionWelcomeMessageSchema.parse('  Вітаємо! ')).toBe('Вітаємо!');
    expect(WELCOME_MESSAGE_MAX_CHARS).toBe(160);
    expect(collectionWelcomeMessageSchema.safeParse('😀'.repeat(160)).success).toBe(true);
    expect(collectionWelcomeMessageSchema.safeParse('😀'.repeat(161)).success).toBe(false);
  });

  test('rejects an empty message, line breaks and control characters', () => {
    for (const value of ['', '   ', 'a\nb', 'a\rb', 'a\tb', 'a\u0000b']) {
      expect(collectionWelcomeMessageSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('collectionCoverSchema', () => {
  test('a READY cover has URLs and dimensions; a PENDING one has nulls', () => {
    const ready = {
      id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
      status: 'READY',
      thumbnailUrl: URL_A,
      previewUrl: URL_B,
      largeUrl: null,
      width: 4000,
      height: 3000,
    };
    expect(collectionCoverSchema.parse(ready)).toEqual(ready);
    const pending = {
      id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
      status: 'PENDING',
      thumbnailUrl: null,
      previewUrl: null,
      largeUrl: null,
      width: null,
      height: null,
    };
    expect(collectionCoverSchema.parse(pending)).toEqual(pending);
    expect(collectionCoverSchema.safeParse({ ...ready, status: 'UPLOADING' }).success).toBe(false);
    expect(collectionCoverSchema.safeParse({ ...ready, source: 'FRAME' }).success).toBe(false);
  });
});

describe('guestCoverSchema', () => {
  const cover = { thumbnailUrl: URL_A, previewUrl: URL_B, width: 4000, height: 3000 };

  test('always has both URLs and positive dimensions', () => {
    expect(guestCoverSchema.parse(cover)).toEqual(cover);
    expect(guestCoverSchema.safeParse({ ...cover, thumbnailUrl: null }).success).toBe(false);
    expect(guestCoverSchema.safeParse({ ...cover, width: 0 }).success).toBe(false);
  });

  test('never carries a status, a source or the source frame', () => {
    expect(guestCoverSchema.safeParse({ ...cover, status: 'READY' }).success).toBe(false);
    expect(guestCoverSchema.safeParse({ ...cover, source: 'FRAME' }).success).toBe(false);
    expect(
      guestCoverSchema.safeParse({
        ...cover,
        sourceContentItemId: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
      }).success,
    ).toBe(false);
  });
});

describe('cover requests', () => {
  test('from-frame takes exactly one content item id', () => {
    const contentItemId = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
    expect(setCoverFromFrameRequestSchema.parse({ contentItemId })).toEqual({ contentItemId });
    expect(setCoverFromFrameRequestSchema.safeParse({}).success).toBe(false);
    expect(setCoverFromFrameRequestSchema.safeParse({ contentItemId: 'x' }).success).toBe(false);
    expect(
      setCoverFromFrameRequestSchema.safeParse({ contentItemId, collectionId: contentItemId })
        .success,
    ).toBe(false);
  });

  test('cover upload params are two UUIDs', () => {
    const id = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
    expect(coverUploadParamsSchema.safeParse({ id, uploadId: id }).success).toBe(true);
    expect(coverUploadParamsSchema.safeParse({ id, uploadId: '1' }).success).toBe(false);
  });
});

describe('the shared control-character rule', () => {
  // DEL, C1, the Unicode line/paragraph separators and the bidi controls.
  const invisible = [
    '\u007f',
    '\u0085',
    '\u009f',
    '\u2028',
    '\u2029',
    '\u202a',
    '\u202e',
    '\u2066',
    '\u2069',
  ];

  test('one-line fields reject DEL, C1, U+2028/U+2029 and bidi controls', () => {
    for (const schema of [
      collectionWelcomeMessageSchema,
      collectionTitleSchema,
      displayNameSchema,
    ]) {
      for (const char of invisible) {
        expect(schema.safeParse(`a${char}b`).success).toBe(false);
      }
      expect(schema.safeParse('Весілля Олі 😀').success).toBe(true);
    }
  });

  test('the description rejects them too but keeps line breaks and tabs', () => {
    expect(collectionDescriptionSchema.safeParse('Line 1\r\nLine 2\tend').success).toBe(true);
    for (const char of ['\u2028', '\u202e', '\u0085']) {
      expect(collectionDescriptionSchema.safeParse(`a${char}b`).success).toBe(false);
    }
  });
});

test('ERROR_CODES contains COVER_SOURCE_INVALID', () => {
  expect(ERROR_CODES).toContain('COVER_SOURCE_INVALID');
});
