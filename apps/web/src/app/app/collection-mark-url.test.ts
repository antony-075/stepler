import type { AdminImage } from '@stepler/contracts';
import { describe, expect, it } from 'vitest';
import { collectionMarkUrl } from './collection-mark-url';

const image = (status: AdminImage['status']): AdminImage => ({
  status,
  thumbnailUrl: status === 'READY' ? 'https://storage.test/collection-image/thumbnail.webp' : null,
  previewUrl: null,
  largeUrl: null,
  width: status === 'READY' ? 1200 : null,
  height: status === 'READY' ? 800 : null,
});

describe('collectionMarkUrl', () => {
  it('is the collection image’s thumbnail once it is ready', () => {
    expect(collectionMarkUrl({ image: image('READY') })).toBe(
      'https://storage.test/collection-image/thumbnail.webp',
    );
  });

  it('is null (the initials) without an image, or while it is pending or failed', () => {
    expect(collectionMarkUrl({ image: null })).toBeNull();
    expect(collectionMarkUrl({ image: image('PENDING') })).toBeNull();
    expect(collectionMarkUrl({ image: image('FAILED') })).toBeNull();
  });
});
