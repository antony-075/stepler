import type { GuestContext } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import { allowedKinds, precheck } from './file-rules';

const context: GuestContext = {
  collection: {
    id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
    title: 'Весілля',
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
    canViewGallery: false,
    canDeleteOwn: true,
  },
  guest: { name: null, nameAnswered: true },
  limits: {
    maxFileBytes: { photo: 50_000_000, video: 2_000_000_000, document: 50_000_000 },
    filesPerBatch: 100,
    textMaxChars: 5000,
  },
  counts: null,
};

/** A File that reports `size` without holding the bytes. */
const file = (name: string, size = 1000, type = ''): File => {
  const f = new File([], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('allowedKinds', () => {
  test('follows the link permissions', () => {
    expect(allowedKinds(context.permissions)).toEqual(['PHOTO', 'VIDEO']);
  });
});

describe('precheck', () => {
  test('120 files with 2 .exe and one 60 MB photo: 100 accepted, 3 rejected, 17 left out', () => {
    const files = [
      file('setup.exe', 1000, 'application/x-msdownload'),
      file('big.jpg', 60_000_000, 'image/jpeg'),
      ...Array.from({ length: 117 }, (_, i) => file(`IMG_${i}.HEIC`)),
      file('virus.exe'),
    ];
    const result = precheck(files, context);
    expect(result.accepted).toHaveLength(100);
    expect(result.accepted[0]).toMatchObject({ kind: 'PHOTO' });
    expect(result.accepted[0]?.file.name).toBe('IMG_0.HEIC');
    expect(result.rejected).toEqual([
      { name: 'setup.exe', reason: 'type' },
      { name: 'big.jpg', reason: 'size' },
      { name: 'virus.exe', reason: 'type' },
    ]);
    expect(result.truncated).toBe(17);
  });

  test('a document on a link without documents is refused as a type', () => {
    expect(precheck([file('plan.pdf', 10, 'application/pdf')], context).rejected).toEqual([
      { name: 'plan.pdf', reason: 'type' },
    ]);
  });

  test('a video up to 2 GB passes; an empty file does not', () => {
    const result = precheck([file('clip.mov', 2_000_000_000), file('empty.jpg', 0)], context);
    expect(result.accepted.map((a) => a.kind)).toEqual(['VIDEO']);
    expect(result.rejected).toEqual([{ name: 'empty.jpg', reason: 'size' }]);
  });

  test('a declared MIME that contradicts the extension is refused', () => {
    expect(precheck([file('a.jpg', 10, 'video/mp4')], context).rejected).toEqual([
      { name: 'a.jpg', reason: 'type' },
    ]);
  });
});
