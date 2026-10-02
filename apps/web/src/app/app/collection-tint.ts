import { FRAME_TINTS, type FrameTint } from '@stepler/ui/lib/frame-tints';

/**
 * A collection's tint, chosen from its id (DESIGN-SYSTEM.md §2.1 «Відтінки кадрів»): the same
 * collection keeps the same tint on the dashboard and on its own page, across reloads and
 * devices, without storing anything. FNV-1a over the id, then one of the curated tints.
 */
export function collectionTint(id: string): FrameTint {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return FRAME_TINTS[(hash >>> 0) % FRAME_TINTS.length] ?? FRAME_TINTS[0];
}
