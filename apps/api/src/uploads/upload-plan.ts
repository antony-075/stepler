// How a file travels (spec §10.2, ADR 0008 addendum 2026-10-03): always a multipart upload with
// fixed-size parts, a file up to the part size being one part. R2 requires every part but the
// last to be the same size (ADR 0008 S4). Multipart for every size because the server's
// CompleteMultipartUpload or AbortMultipartUpload ends the upload, and with it every part URL;
// a presigned single PUT stayed writable for its whole TTL (review I1). Pure, so the arithmetic
// is tested on its own.

export interface UploadPlan {
  partSizeBytes: bigint;
  partCount: number;
}

/** S3 allows at most 10 000 parts per upload. */
export const MAX_PARTS = 10_000;

export function planUpload(sizeBytes: bigint, partSize: bigint): UploadPlan {
  const partCount = Number((sizeBytes + partSize - 1n) / partSize);
  if (partCount > MAX_PARTS) throw new RangeError('too many parts for this part size');
  return { partSizeBytes: partSize, partCount: Math.max(1, partCount) };
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
