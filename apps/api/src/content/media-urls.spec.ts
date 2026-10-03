import { describe, expect, test } from 'vitest';
import { contentDispositionFor, fallbackFilename, windowStart } from './media-urls.js';

describe('contentDispositionFor', () => {
  test('strips path separators, quotes and control characters; RFC 5987 name + ASCII fallback', () => {
    const value = contentDispositionFor('../../ev"il\u0000.pdf', 'stepler-007.pdf');
    expect(value).toMatch(/^attachment; filename="stepler-007\.pdf"; filename\*=UTF-8''/);
    const encoded = value.split("filename*=UTF-8''")[1] ?? '';
    expect(decodeURIComponent(encoded)).toBe('....evil.pdf');
    expect(value.includes('\u0000') || value.includes('/') || value.includes('\\')).toBe(false);
    expect(value.match(/"/g)).toHaveLength(2); // only the fallback's quotes
  });

  test('keeps Unicode names, encoded', () => {
    const value = contentDispositionFor('Весілля (1).jpg', 'stepler-001.jpg');
    expect(value).toContain(`filename*=UTF-8''${encodeURIComponent('Весілля')}%20%281%29.jpg`);
  });

  test('at most 150 code points; an empty or dot name uses the fallback', () => {
    const long = `${'😀'.repeat(200)}.jpg`;
    const encoded = contentDispositionFor(long, 'f.jpg').split("UTF-8''")[1] ?? '';
    expect([...decodeURIComponent(encoded)]).toHaveLength(150);
    expect(contentDispositionFor('/\\"', 'stepler-002.txt')).toBe(
      `attachment; filename="stepler-002.txt"; filename*=UTF-8''stepler-002.txt`,
    );
    expect(contentDispositionFor(null, 'stepler-003.pdf')).toContain("UTF-8''stepler-003.pdf");
  });
});

describe('fallbackFilename', () => {
  test('frame number with the verified type’s extension, else the name’s', () => {
    const item = { kind: 'DOCUMENT' as const, frameNo: 87, originalFilename: 'План.PDF' };
    expect(fallbackFilename(item, 'application/pdf')).toBe('stepler-087.pdf');
    expect(fallbackFilename({ ...item, originalFilename: 'photo.png' }, 'image/jpeg')).toBe(
      'stepler-087.jpg',
    );
    expect(fallbackFilename({ ...item, originalFilename: 'notes.txt' }, 'x/unknown')).toBe(
      'stepler-087.txt',
    );
    expect(fallbackFilename({ ...item, originalFilename: 'noext' }, 'image/jpeg')).toBe(
      'stepler-087.jpg',
    );
    expect(fallbackFilename({ ...item, frameNo: 1234, originalFilename: null }, 'x/y')).toBe(
      'stepler-1234.bin',
    );
  });
});

describe('windowStart', () => {
  test('aligns to the window, so two signings in one window agree', () => {
    const a = windowStart(new Date('2026-10-03T12:10:00Z'), 3600);
    const b = windowStart(new Date('2026-10-03T12:59:59Z'), 3600);
    expect(a.toISOString()).toBe('2026-10-03T12:00:00.000Z');
    expect(b).toEqual(a);
  });
});
