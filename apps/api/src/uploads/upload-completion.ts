import { Inject, Injectable, Logger } from '@nestjs/common';
import { fileTypeFor, type GuestContentItem } from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import { toGuestContentItem } from '../content/content-dto.js';
import { FrameNumbers } from '../content/frame-numbers.js';
import { MediaUrls, WITH_MEDIA } from '../content/media-urls.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma, UploadSession } from '../generated/prisma/client.js';
import { canUploadKind } from '../guest-access/guest-policy.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { detectFileType, matchesDeclared, verifiedMime } from './file-signature.js';
import { partLength } from './upload-plan.js';
import { findOwnUpload, viaStorage } from './uploads.service.js';

/** Bytes read to detect the type ([C17]). */
const SIGNATURE_BYTES = 4096;
/** The row lock is held across bounded storage calls [C18]. */
const TRANSACTION_TIMEOUT_MS = 30_000;

/** What the transaction decided; errors are thrown after it commits. */
type Outcome =
  | { kind: 'item'; contentItemId: string }
  | { kind: 'refused'; error: AppError; uploadSessionId: string; reason: string };

/**
 * Completes a direct upload (spec §10.4, [C18]). The upload row is locked for the whole check,
 * so a duplicate or concurrent completion waits and then gets the same item. The server alone
 * completes multipart uploads (`ListParts` + `CompleteMultipartUpload`, client ETags are never
 * used), then checks the stored size and the content signature. A refusal is recorded
 * (`REJECTED` or `EXPIRED`) and its bytes queued for discarding in the same transaction; the
 * error is thrown after the commit.
 */
@Injectable()
export class UploadCompletion {
  private readonly logger = new Logger(UploadCompletion.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly frames: FrameNumbers,
    private readonly media: MediaUrls,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /**
   * `closed` is the session's link or collection state when it no longer accepts guests
   * (`@AllowClosedLink`): the guest's open upload is then refused with that state (D8).
   */
  async complete(
    p: GuestPrincipal,
    uploadId: string,
    closed: AppError | null = null,
  ): Promise<GuestContentItem> {
    // Started outside the transaction, so a first start never runs while it holds a connection.
    await this.jobs.ready();
    const outcome = await this.prisma.$transaction((tx) => this.decide(tx, p, uploadId, closed), {
      timeout: TRANSACTION_TIMEOUT_MS,
      maxWait: 10_000,
    });
    if (outcome.kind === 'refused') {
      this.logger.log({
        msg: 'upload refused',
        uploadSessionId: outcome.uploadSessionId,
        reason: outcome.reason,
      });
      throw outcome.error;
    }
    const item = await this.prisma.contentItem.findUniqueOrThrow({
      where: { id: outcome.contentItemId },
      include: WITH_MEDIA,
    });
    return toGuestContentItem(item, p, await this.media.forItem(item));
  }

  private async decide(
    tx: Prisma.TransactionClient,
    p: GuestPrincipal,
    uploadId: string,
    closed: AppError | null,
  ): Promise<Outcome> {
    // Scope first (another guest's upload is 404), then lock the row and read it again.
    await findOwnUpload(tx, p, uploadId);
    await tx.$queryRaw`SELECT 1 FROM "UploadSession" WHERE "id" = ${uploadId}::uuid FOR UPDATE`;
    const row = await tx.uploadSession.findUniqueOrThrow({ where: { id: uploadId } });

    if (row.status === 'COMPLETED') {
      if (closed !== null) throw closed;
      return this.completedItem(tx, row);
    }
    if (row.status === 'ABORTED' || row.status === 'REJECTED') {
      if (closed !== null) throw closed;
      throw new AppError('UPLOAD_CLOSED', 409);
    }
    if (row.status === 'EXPIRED') throw new AppError('UPLOAD_EXPIRED', 410);
    if (row.expiresAt <= new Date()) {
      await tx.uploadSession.update({ where: { id: row.id }, data: { status: 'EXPIRED' } });
      await this.jobs.enqueue(tx, 'storage.discard-upload', { uploadSessionId: row.id });
      return refused(row, new AppError('UPLOAD_EXPIRED', 410), 'UPLOAD_EXPIRED');
    }

    // Re-authorized now (D8): a link paused, revoked or narrowed since initiation refuses.
    if (closed !== null) return this.reject(tx, row, closed);
    if (row.kind === 'TEXT' || !canUploadKind(p, row.kind)) {
      return this.reject(tx, row, new AppError('FORBIDDEN', 403));
    }

    if (row.strategy === 'MULTIPART') {
      const incomplete = await this.completeMultipart(row);
      if (incomplete !== null) throw incomplete;
    }

    const head = await viaStorage(() => this.storage.head(row.storageKey));
    if (head === null) throw new AppError('UPLOAD_INCOMPLETE', 409, { retryable: true });
    if (BigInt(head.size) !== row.declaredSizeBytes) {
      return this.reject(tx, row, new AppError('UPLOAD_SIZE_MISMATCH', 422));
    }
    const bytes = await viaStorage(() =>
      this.storage.readRange(row.storageKey, 0, SIGNATURE_BYTES - 1),
    );
    const detected = detectFileType(bytes);
    const declared = fileTypeFor(row.originalFilename, row.declaredMime);
    if (detected === null || declared === null || !matchesDeclared(detected, declared)) {
      return this.reject(tx, row, new AppError('FILE_TYPE_NOT_ALLOWED', 422));
    }

    // Takes the collection lock and re-checks it is ACTIVE.
    const frameNo = await this.frames.next(tx, row.collectionId);
    const session = await tx.guestSession.findUniqueOrThrow({
      where: { id: row.guestSessionId },
      select: { contributorName: true },
    });
    const kind = row.kind;
    const item = await tx.contentItem.create({
      data: {
        collectionId: row.collectionId,
        frameNo,
        kind,
        contributorGuestSessionId: row.guestSessionId,
        contributorName: session.contributorName,
        originalFilename: row.originalFilename,
        processingStatus: kind === 'DOCUMENT' ? 'NOT_REQUIRED' : 'PENDING',
        mediaObjects: {
          create: {
            role: 'ORIGINAL',
            storageKey: row.storageKey,
            mimeType: verifiedMime(detected, declared),
            sizeBytes: BigInt(head.size),
          },
        },
      },
    });
    await tx.uploadSession.update({
      where: { id: row.id },
      data: { status: 'COMPLETED', completedAt: new Date(), contentItemId: item.id },
    });
    // Previews arrive with media processing (PR D); until then these jobs wait in the queue.
    if (kind === 'PHOTO') {
      await this.jobs.enqueue(tx, 'media.image-derivatives', { contentItemId: item.id });
    } else if (kind === 'VIDEO') {
      await this.jobs.enqueue(tx, 'media.video-poster', { contentItemId: item.id });
    }
    this.logger.log({
      msg: 'upload completed',
      uploadSessionId: row.id,
      contentItemId: item.id,
      kind,
      sizeBytes: head.size,
    });
    return { kind: 'item', contentItemId: item.id };
  }

  /** A repeat of a completion that already happened: the same item, unless it is gone. */
  private async completedItem(tx: Prisma.TransactionClient, row: UploadSession): Promise<Outcome> {
    if (row.contentItemId === null) throw new AppError('CONTENT_NOT_FOUND', 404);
    const item = await tx.contentItem.findUnique({
      where: { id: row.contentItemId },
      select: { deletedAt: true },
    });
    if (item === null || item.deletedAt !== null) throw new AppError('CONTENT_NOT_FOUND', 404);
    return { kind: 'item', contentItemId: row.contentItemId };
  }

  /**
   * Assembles the multipart upload from the parts storage lists, after checking each has its
   * exact length. Missing or wrong parts: `409 UPLOAD_INCOMPLETE` with `missingPartNumbers`, and
   * the upload stays open. Already assembled (a completion that failed after this step): no-op.
   */
  private async completeMultipart(row: UploadSession): Promise<AppError | null> {
    const { multipartUploadId, partSizeBytes, partCount } = row;
    if (multipartUploadId === null || partSizeBytes === null || partCount === null) {
      throw new Error('multipart upload without its parameters');
    }
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

  private async reject(
    tx: Prisma.TransactionClient,
    row: UploadSession,
    error: AppError,
  ): Promise<Outcome> {
    await tx.uploadSession.update({
      where: { id: row.id },
      data: { status: 'REJECTED', rejectReason: error.code },
    });
    await this.jobs.enqueue(tx, 'storage.discard-upload', { uploadSessionId: row.id });
    return refused(row, error, error.code);
  }
}

const refused = (row: UploadSession, error: AppError, reason: string): Outcome => ({
  kind: 'refused',
  error,
  uploadSessionId: row.id,
  reason,
});
