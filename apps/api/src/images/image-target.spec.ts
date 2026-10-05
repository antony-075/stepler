import { describe, expect, test } from 'vitest';
import type { ImageTarget } from './collection-images.service.js';
import { RENDITIONS } from './image-keys.js';
import { uploadTargetOf } from './image-uploads.service.js';

// The image slot of a reference is enforced by the application, not the database (ADR 0017):
// every write takes the row's slot, the upload's purpose and the reference column from one
// `ImageTarget`, so a cover column can only ever be pointed at a COVER image.
describe('image targets', () => {
  test.each<[ImageTarget, ReturnType<typeof uploadTargetOf>]>([
    [
      { slot: 'COVER', version: 'DRAFT' },
      { purpose: 'COVER', imageTarget: 'DRAFT' },
    ],
    [
      { slot: 'BACKGROUND', version: 'DRAFT' },
      { purpose: 'BACKGROUND', imageTarget: 'DRAFT' },
    ],
    [{ slot: 'COLLECTION_IMAGE' }, { purpose: 'COLLECTION_IMAGE', imageTarget: 'COLLECTION' }],
  ])('%j uploads as %j', (target, expected) => {
    expect(uploadTargetOf(target)).toEqual(expected);
    // The upload's purpose is the image row's slot, which picks its renditions.
    expect(RENDITIONS[uploadTargetOf(target).purpose].length).toBeGreaterThan(0);
  });

  test('each target has its own upload binding (no route completes another’s upload)', () => {
    const bindings = (
      [
        { slot: 'COVER', version: 'DRAFT' },
        { slot: 'BACKGROUND', version: 'DRAFT' },
        { slot: 'COLLECTION_IMAGE' },
      ] satisfies ImageTarget[]
    ).map((target) => JSON.stringify(uploadTargetOf(target)));
    expect(new Set(bindings).size).toBe(bindings.length);
  });
});
