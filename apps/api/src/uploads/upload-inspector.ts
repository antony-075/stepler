import { Inject, Injectable } from '@nestjs/common';
import { fileTypeFor } from '@stepler/contracts';
import { AppError } from '../errors/app-error.js';
import type { UploadSession } from '../generated/prisma/client.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { detectFileType, matchesDeclared, verifiedMime } from './file-signature.js';
import { partLength } from './upload-plan.js';
import { viaStorage } from './uploads.service.js';

/** Bytes read to detect the type ([C17]). */
export const SIGNATURE_BYTES = 4096;

/** What storage showed about the upload: a file to record, or the reason it is refused. */
export type Verdict =
  { kind: 'file'; mime: string; size: number } | { kind: 'refuse'; error: AppError };

/**
 * Step 2 of every completion (spec §10.4), outside any transaction: the server alone assembles
 * the multipart upload (`ListParts` + `CompleteMultipartUpload`; client ETags are never used),
 * then checks the stored size and the content signature. Shared by guest content uploads and the
 * admin's cover upload, which differ only in what they record afterwards.
 */
@Injectable()
export class UploadInspector {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  /**
   * Missing or wrong parts are `409 UPLOAD_INCOMPLETE` with `missingPartNumbers` (the upload
   * stays open); storage trouble is `503`. Both are thrown, so the caller gives the claim back.
   */
  async inspect(row: UploadSession): Promise<Verdict> {
    const missing = await this.assemble(row);
    if (missing !== null) throw missing;
    const head = await viaStorage(() => this.storage.head(row.storageKey));
    if (head === null) throw new AppError('UPLOAD_INCOMPLETE', 409, { retryable: true });
    if (BigInt(head.size) !== row.declaredSizeBytes) {
      return { kind: 'refuse', error: new AppError('UPLOAD_SIZE_MISMATCH', 422) };
    }
    const bytes = await viaStorage(() =>
      this.storage.readRange(row.storageKey, 0, SIGNATURE_BYTES - 1),
    );
    const detected = detectFileType(bytes);
    const declared = fileTypeFor(row.originalFilename, row.declaredMime);
    if (detected === null || declared === null || !matchesDeclared(detected, declared)) {
      return { kind: 'refuse', error: new AppError('FILE_TYPE_NOT_ALLOWED', 422) };
    }
    return { kind: 'file', mime: verifiedMime(detected, declared), size: head.size };
  }

  /**
   * Assembles the multipart upload from the parts storage lists, after checking each has its
   * exact length; returns the error to throw when parts are missing. Already assembled (a
   * completion that failed after this step): nothing to do.
   */
  private async assemble(row: UploadSession): Promise<AppError | null> {
    const { multipartUploadId, partSizeBytes, partCount } = row;
    const parts = await viaStorage(() => this.storage.listParts(row.storageKey, multipartUploadId));
    if (parts === null) return null;
    const byNumber = new Map(parts.map((part) => [part.partNumber, part]));
    const missing: number[] = [];
    for (let n = 1; n <= partCount; n += 1) {
      const part = byNumber.get(n);
      if (
        part === undefined ||
        BigInt(part.size) !== partLength(row.declaredSizeBytes, partSizeBytes, n)
      ) {
        missing.push(n);
      }
    }
    if (missing.length > 0) {
      return new AppError('UPLOAD_INCOMPLETE', 409, {
        retryable: true,
        extensions: { missingPartNumbers: missing },
      });
    }
    await viaStorage(() =>
      this.storage.completeMultipart(
        row.storageKey,
        multipartUploadId,
        parts.filter((part) => part.partNumber <= partCount),
      ),
    );
    return null;
  }
}
