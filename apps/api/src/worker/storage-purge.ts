import type { ObjectStorage } from '../storage/object-storage.js';

/**
 * Deletes every object under `prefix`, `batchSize` keys per storage call. It always lists from
 * the start (deleted keys disappear), so a run interrupted after any batch resumes on rerun.
 * Returns the number of objects deleted.
 */
export async function deletePrefix(
  storage: ObjectStorage,
  prefix: string,
  batchSize: number,
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const { keys } = await storage.listKeys(prefix, { limit: batchSize });
    if (keys.length === 0) return deleted;
    await storage.deleteMany(keys);
    deleted += keys.length;
  }
}

/** Key prefixes (spec §10.1): all of a collection's objects live under its own prefix. */
export const collectionPrefix = (collectionId: string): string => `collections/${collectionId}/`;
export const derivedPrefix = (collectionId: string, contentItemId: string): string =>
  `collections/${collectionId}/derived/${contentItemId}/`;
