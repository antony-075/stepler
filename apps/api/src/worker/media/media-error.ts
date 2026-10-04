/**
 * The file itself cannot be processed (corrupt, unsupported, over the pixel limit): retrying
 * cannot help, so the item is marked `FAILED` at once and the job ends. Any other error is
 * retried (`JOB_OPTIONS`) and marks the item `FAILED` only after the last attempt.
 */
export class PermanentMediaError extends Error {
  override readonly name = 'PermanentMediaError';
}
