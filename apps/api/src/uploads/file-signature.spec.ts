import { readFileSync } from 'node:fs';
import { fileTypeFor } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { detectFileType, matchesDeclared, verifiedMime } from './file-signature.js';

const fixtures = new URL('../../test/fixtures/media/', import.meta.url);
/** The first 4 KB, as completion reads them with a range GET. */
const head = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(name, fixtures)).subarray(0, 4096));

const declared = (filename: string) => {
  const type = fileTypeFor(filename, '');
  if (type === null) throw new Error(`${filename} is not an allowed type`);
  return type;
};

const OOXML = 'application/vnd.openxmlformats-officedocument';

describe('detectFileType', () => {
  test.each([
    ['photo.jpg', 'PHOTO', 'image/jpeg'],
    ['photo.png', 'PHOTO', 'image/png'],
    ['photo.webp', 'PHOTO', 'image/webp'],
    ['anim.gif', 'PHOTO', 'image/gif'],
    ['photo.heic', 'PHOTO', 'image/heic'],
    ['clip.mp4', 'VIDEO', 'video/mp4'],
    ['clip.mov', 'VIDEO', 'video/quicktime'],
    ['clip.webm', 'VIDEO', 'video/webm'],
    ['doc.pdf', 'DOCUMENT', 'application/pdf'],
    ['doc.docx', 'DOCUMENT', OOXML],
    ['sheet.xlsx', 'DOCUMENT', OOXML],
    ['deck.pptx', 'DOCUMENT', OOXML],
    ['notes.txt', 'DOCUMENT', 'text/plain'],
  ])('%s → %s %s', (name, kind, mime) => {
    expect(detectFileType(head(name))).toEqual({ kind, mime });
  });

  test.each(['fake.jpg', 'archive.zip', 'image.svg', 'page.html', 'latin1.txt'])(
    '%s → null',
    (name) => {
      expect(detectFileType(head(name))).toBeNull();
    },
  );

  test('empty input → null', () => {
    expect(detectFileType(new Uint8Array())).toBeNull();
  });

  test('a TXT whose 4 KB slice ends mid-character is still TXT', () => {
    // «я» is two bytes in UTF-8; one leading ASCII byte puts the slice end inside a character.
    const bytes = new TextEncoder().encode(`a${'я'.repeat(3000)}`).subarray(0, 4096);
    expect(bytes.length).toBe(4096);
    expect(detectFileType(bytes)).toEqual({ kind: 'DOCUMENT', mime: 'text/plain' });
  });

  test('a TXT with a NUL byte is not text', () => {
    expect(detectFileType(new TextEncoder().encode('ab\u0000cd'))).toBeNull();
  });

  test('a UTF-8 BOM is allowed', () => {
    expect(detectFileType(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]))?.mime).toBe('text/plain');
  });

  test('an AVIF ftyp is not an allowed photo', () => {
    const avif = new Uint8Array([
      0,
      0,
      0,
      0x1c,
      ...new TextEncoder().encode('ftypavif'),
      0,
      0,
      0,
      0,
      ...new TextEncoder().encode('avifmif1miaf'),
    ]);
    expect(detectFileType(avif)).toBeNull();
  });
});

describe('matchesDeclared', () => {
  test('every fixture matches its own extension', () => {
    for (const name of [
      'photo.jpg',
      'photo.png',
      'photo.webp',
      'anim.gif',
      'photo.heic',
      'clip.mp4',
      'clip.mov',
      'clip.webm',
      'doc.pdf',
      'doc.docx',
      'sheet.xlsx',
      'deck.pptx',
      'notes.txt',
    ]) {
      const detected = detectFileType(head(name));
      expect(detected, name).not.toBeNull();
      if (detected !== null) expect(matchesDeclared(detected, declared(name)), name).toBe(true);
    }
  });

  test('photos and videos match on kind: a JPEG named .png, an MP4 named .mov or .webm', () => {
    const mp4 = detectFileType(head('clip.mp4'));
    const heic = detectFileType(head('photo.heic'));
    const jpg = detectFileType(head('photo.jpg'));
    if (mp4 === null || heic === null || jpg === null) throw new Error('fixtures not detected');
    expect(matchesDeclared(mp4, declared('IMG_1.MOV'))).toBe(true);
    expect(matchesDeclared(mp4, declared('clip.webm'))).toBe(true);
    expect(matchesDeclared(heic, declared('IMG_1.HEIF'))).toBe(true);
    expect(matchesDeclared(jpg, declared('a.png'))).toBe(true);
    expect(verifiedMime(jpg, declared('a.png'))).toBe('image/jpeg');
  });

  test('another kind, or another document format, does not match', () => {
    const jpg = detectFileType(head('photo.jpg'));
    const pdf = detectFileType(head('doc.pdf'));
    const txt = detectFileType(head('notes.txt'));
    const docx = detectFileType(head('doc.docx'));
    if (jpg === null || pdf === null || txt === null || docx === null) {
      throw new Error('fixtures not detected');
    }
    expect(matchesDeclared(jpg, declared('a.mp4'))).toBe(false);
    expect(matchesDeclared(jpg, declared('a.pdf'))).toBe(false);
    expect(matchesDeclared(pdf, declared('a.docx'))).toBe(false);
    expect(matchesDeclared(txt, declared('a.pdf'))).toBe(false);
    expect(matchesDeclared(docx, declared('a.xlsx'))).toBe(true);
  });
});

describe('verifiedMime', () => {
  test('OOXML takes the declared type; everything else the detected one', () => {
    const docx = detectFileType(head('doc.docx'));
    const mp4 = detectFileType(head('clip.mp4'));
    if (docx === null || mp4 === null) throw new Error('fixtures not detected');
    expect(verifiedMime(docx, declared('doc.docx'))).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(verifiedMime(mp4, declared('IMG_1.MOV'))).toBe('video/mp4');
  });
});
