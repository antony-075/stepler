// How a file of a given size travels (spec §10.2): one presigned PUT up to the single-PUT
// maximum, multipart above it with fixed-size parts (R2 requires every part but the last to be
// the same size, ADR 0008 S4). Pure, so the arithmetic is tested on its own.

export type UploadPlan =
  { strategy: 'SINGLE' } | { strategy: 'MULTIPART'; partSizeBytes: bigint; partCount: number };

/** S3 allows at most 10 000 parts per upload. */
export const MAX_PARTS = 10_000;

export function planUpload(
  sizeBytes: bigint,
  cfg: { singlePutMax: bigint; partSize: bigint },
): UploadPlan {
  if (sizeBytes <= cfg.singlePutMax) return { strategy: 'SINGLE' };
  const partCount = Number((sizeBytes + cfg.partSize - 1n) / cfg.partSize);
  if (partCount > MAX_PARTS) throw new RangeError('too many parts for this part size');
  return { strategy: 'MULTIPART', partSizeBytes: cfg.partSize, partCount };
}

/** The exact length of part `partNumber` (1-based): the part size, the remainder for the last. */
export function partLength(sizeBytes: bigint, partSize: bigint, partNumber: number): bigint {
  const start = BigInt(partNumber - 1) * partSize;
  const remaining = sizeBytes - start;
  return remaining < partSize ? remaining : partSize;
}

/** The original's key (spec §10.6): no user data, never renamed. */
export const uploadKey = (collectionId: string, uploadSessionId: string): string =>
  `collections/${collectionId}/uploads/${uploadSessionId}/original`;
