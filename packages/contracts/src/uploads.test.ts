import { describe, expect, test } from 'vitest';
import {
  createUploadRequestSchema,
  extensionOf,
  FILE_TYPES,
  fileTypeFor,
  uploadPartsRequestSchema,
  uploadPartsResponseSchema,
  uploadSessionResponseSchema,
} from './index.js';

const id = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';

describe('FILE_TYPES', () => {
  test('lists exactly the D3 extensions', () => {
    expect(FILE_TYPES.map((t) => t.ext).sort()).toEqual(
      [
        'docx',
        'gif',
        'heic',
        'heif',
        'jpeg',
        'jpg',
        'mov',
        'mp4',
        'pdf',
        'png',
        'pptx',
        'txt',
        'webm',
        'webp',
        'xlsx',
      ].sort(),
    );
  });

  test('the canonical MIME is one of the accepted ones', () => {
    for (const type of FILE_TYPES) expect(type.mimes).toContain(type.canonicalMime);
  });
});

describe('extensionOf', () => {
  test('lower-cases the part after the last dot', () => {
    expect(extensionOf('IMG_1.HEIC')).toBe('heic');
    expect(extensionOf('a.tar.gz')).toBe('gz');
    expect(extensionOf('noext')).toBe('');
    expect(extensionOf('.txt')).toBe('');
  });
});

describe('fileTypeFor', () => {
  test('HEIC with no declared MIME is a photo', () => {
    expect(fileTypeFor('IMG_1.HEIC', '')).toEqual({
      kind: 'PHOTO',
      canonicalMime: 'image/heic',
      ext: 'heic',
    });
  });

  test('accepts application/octet-stream and MIME parameters', () => {
    expect(fileTypeFor('clip.mov', 'application/octet-stream')?.kind).toBe('VIDEO');
    expect(fileTypeFor('notes.txt', 'text/plain;charset=UTF-8')?.canonicalMime).toBe('text/plain');
    expect(fileTypeFor('a.JPG', 'IMAGE/JPEG')?.kind).toBe('PHOTO');
  });

  test('a .mov declared as video/quicktime keeps its canonical MIME', () => {
    expect(fileTypeFor('IMG_2.MOV', 'video/quicktime')).toEqual({
      kind: 'VIDEO',
      canonicalMime: 'video/quicktime',
      ext: 'mov',
    });
  });

  test('documents map to their kinds', () => {
    expect(fileTypeFor('plan.docx', '')?.kind).toBe('DOCUMENT');
    expect(fileTypeFor('a.pdf', 'application/pdf')?.kind).toBe('DOCUMENT');
  });

  test('refuses disallowed extensions whatever the MIME', () => {
    expect(fileTypeFor('a.exe', 'image/jpeg')).toBeNull();
    expect(fileTypeFor('a.svg', 'image/svg+xml')).toBeNull();
    expect(fileTypeFor('a.html', 'text/html')).toBeNull();
    expect(fileTypeFor('a.zip', 'application/zip')).toBeNull();
    expect(fileTypeFor('jpg', 'image/jpeg')).toBeNull();
  });

  test('refuses a declared MIME that contradicts the extension', () => {
    expect(fileTypeFor('a.jpg', 'video/mp4')).toBeNull();
    expect(fileTypeFor('a.txt', 'text/html')).toBeNull();
  });
});

describe('createUploadRequestSchema', () => {
  const body = { clientUploadId: id, filename: 'IMG_1.HEIC', mimeType: '', sizeBytes: 1 };

  test('accepts an empty MIME type', () => {
    expect(createUploadRequestSchema.safeParse(body).success).toBe(true);
  });

  test('rejects control characters, long names, zero sizes and unknown fields', () => {
    expect(createUploadRequestSchema.safeParse({ ...body, filename: 'a\u0000.jpg' }).success).toBe(
      false,
    );
    expect(
      createUploadRequestSchema.safeParse({ ...body, filename: `${'a'.repeat(252)}.jpg` }).success,
    ).toBe(false);
    expect(createUploadRequestSchema.safeParse({ ...body, sizeBytes: 0 }).success).toBe(false);
    expect(createUploadRequestSchema.safeParse({ ...body, sizeBytes: 1.5 }).success).toBe(false);
    expect(createUploadRequestSchema.safeParse({ ...body, kind: 'PHOTO' }).success).toBe(false);
  });
});

describe('uploadSessionResponseSchema', () => {
  const session = {
    uploadId: id,
    partSizeBytes: 10_485_760,
    partCount: 1,
    expiresAt: '2026-10-03T12:00:00.000Z',
  };

  test('every upload is multipart: a part size and count, no URL', () => {
    expect(uploadSessionResponseSchema.parse(session)).toEqual(session);
    expect(
      uploadSessionResponseSchema.safeParse({ ...session, url: 'https://s3.test/x' }).success,
    ).toBe(false);
    expect(uploadSessionResponseSchema.safeParse({ ...session, partCount: 0 }).success).toBe(false);
  });
});

describe('uploadPartsRequestSchema', () => {
  test('1 to 100 unique part numbers between 1 and 10 000', () => {
    expect(uploadPartsRequestSchema.safeParse({ partNumbers: [1, 2, 10_000] }).success).toBe(true);
    expect(uploadPartsRequestSchema.safeParse({ partNumbers: [] }).success).toBe(false);
    expect(uploadPartsRequestSchema.safeParse({ partNumbers: [0] }).success).toBe(false);
    expect(uploadPartsRequestSchema.safeParse({ partNumbers: [10_001] }).success).toBe(false);
    expect(uploadPartsRequestSchema.safeParse({ partNumbers: [2, 2] }).success).toBe(false);
    const many = Array.from({ length: 101 }, (_, i) => i + 1);
    expect(uploadPartsRequestSchema.safeParse({ partNumbers: many }).success).toBe(false);
  });

  test('the response lists part URLs', () => {
    expect(
      uploadPartsResponseSchema.safeParse({
        parts: [{ partNumber: 1, url: 'https://s3.test/k?partNumber=1' }],
        expiresAt: '2026-10-03T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
