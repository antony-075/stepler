import { Inject, Injectable, Logger } from '@nestjs/common';
import { fileTypeFor, type GuestContentItem } from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import { toGuestContentItem } from '../content/content-dto.js';
import { FrameNumbers } from '../content/frame-numbers.js';
import { MediaUrls, WITH_MEDIA } from '../content/media-urls.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma, UploadSession } from '../generated/prisma/client.js';
import { permissionsOf } from '../guest-access/guest-link-dto.js';
import { assertLinkUsable } from '../guest-access/guest-link-resolver.js';
import { canUploadKind } from '../guest-access/guest-policy.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { detectFileType, matchesDeclared, verifiedMime } from './file-signature.js';
import { partLength, staleClaimBefore } from './upload-plan.js';
import {
  findOwnUpload,
  isBeingCompleted,
  uploadInProgress,
  viaStorage,
} from './uploads.service.js';

/** Bytes read to detect the type ([C17]). */
const SIGNATURE_BYTES = 4096;

/** What storage showed about the upload: a file to record, or the reason it is refused. */
type Verdict = { kind: 'file'; mime: string; size: number } | { kind: 'refuse'; error: AppError };

/** What a short transaction decided; errors are thrown after it commits. */
type Outcome =
  | { kind: 'item'; contentItemId: string }
  | { kind: 'claimed'; claimedAt: Date; row: UploadSession }
  | { kind: 'refused'; error: AppError; reason: string };

/**
 * Completes a direct upload (spec §10.4) in three steps, so no database connection waits on
 * storage (review I2):
 * 1. a short transaction claims the upload (`COMPLETING`, `claimedAt`) after the state and
 *    permission checks; a concurrent completion then gets `409 UPLOAD_IN_PROGRESS` (retryable),
 *    a finished one the same item;
 * 2. outside any transaction, the server alone assembles the multipart upload (`ListParts` +
 *    `CompleteMultipartUpload`; client ETags are never used), then checks the stored size and
 *    the content signature; storage trouble or missing parts give the claim back;
 * 3. a short transaction re-checks the claim, the link and the permission, then records the
 *    frame (`COMPLETED`), or the refusal (`REJECTED`, bytes queued for discarding).
 * A claim left by a crashed request is stale after `COMPLETION_CLAIM_TTL_SECONDS`: it can be
 * claimed again, and the expiry job expires it past the session's TTL.
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
    // Started outside the transactions, so a first start never runs while one holds a connection.
    await this.jobs.ready();
    const claim = await this.prisma.$transaction((tx) => this.claim(tx, p, uploadId, closed));
    if (claim.kind !== 'claimed') return this.finish(p, claim);

    let verdict: Verdict;
    try {
      verdict = await this.inspect(claim.row);
    } catch (error) {
      // Missing parts or storage trouble: give the claim back so the guest can retry at once.
      await this.release(claim.row.id, claim.claimedAt);
      throw error;
    }
    const outcome = await this.prisma.$transaction((tx) =>
      this.record(tx, claim.row.id, claim.claimedAt, verdict),
    );
    return this.finish(p, outcome);
  }

  private async finish(p: GuestPrincipal, outcome: Outcome): Promise<GuestContentItem> {
    if (outcome.kind === 'refused') throw outcome.error;
    if (outcome.kind === 'claimed') throw new Error('unreachable: an unfinished claim');
    const item = await this.prisma.contentItem.findUniqueOrThrow({
      where: { id: outcome.contentItemId },
      include: WITH_MEDIA,
    });
    return toGuestContentItem(item, p, await this.media.forItem(item));
  }

  /** Step 1: state and permission checks under the row lock, then the claim. */
  private async claim(
    tx: Prisma.TransactionClient,
    p: GuestPrincipal,
    uploadId: string,
    closed: AppError | null,
  ): Promise<Outcome> {
    // Scope first (another guest's upload is 404), then lock the row and read it again.
    const own = await findOwnUpload(tx, p, uploadId);
    await tx.$queryRaw`SELECT 1 FROM "UploadSession" WHERE "id" = ${own.id}::uuid FOR UPDATE`;
    const row = await tx.uploadSession.findUniqueOrThrow({ where: { id: own.id } });

    if (row.status === 'COMPLETED') {
      if (closed !== null) throw closed;
      return this.completedItem(tx, row);
    }
    if (row.status === 'ABORTED' || row.status === 'REJECTED') {
      if (closed !== null) throw closed;
      throw new AppError('UPLOAD_CLOSED', 409);
    }
    if (row.status === 'EXPIRED') throw new AppError('UPLOAD_EXPIRED', 410);
    if (isBeingCompleted(row)) throw uploadInProgress();
    if (row.expiresAt <= new Date()) {
      return this.close(tx, row, 'EXPIRED', new AppError('UPLOAD_EXPIRED', 410));
    }
    // Re-authorized now (D8): a link paused, revoked or narrowed since initiation refuses.
    if (closed !== null) return this.close(tx, row, 'REJECTED', closed);
    if (row.kind === 'TEXT' || !canUploadKind(p, row.kind)) {
      return this.close(tx, row, 'REJECTED', new AppError('FORBIDDEN', 403));
    }

    const claimedAt = new Date();
    const { count } = await tx.uploadSession.updateMany({
      where: {
        id: row.id,
        OR: [
          { status: 'INITIATED' },
          { status: 'COMPLETING', claimedAt: { lt: staleClaimBefore(claimedAt) } },
        ],
      },
      data: { status: 'COMPLETING', claimedAt },
    });
    if (count === 0) throw uploadInProgress();
    return { kind: 'claimed', claimedAt, row };
  }

  /**
   * Step 2, outside any transaction: assemble the parts, then check size and content. Missing
   * or wrong parts are `409 UPLOAD_INCOMPLETE` with `missingPartNumbers` (the upload stays open).
   */
  private async inspect(row: UploadSession): Promise<Verdict> {
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
   * Step 3: if the claim still holds, re-check the link and the permission now, then record
   * the frame or the refusal.
   */
  private async record(
    tx: Prisma.TransactionClient,
    uploadId: string,
    claimedAt: Date,
    verdict: Verdict,
  ): Promise<Outcome> {
    await tx.$queryRaw`SELECT 1 FROM "UploadSession" WHERE "id" = ${uploadId}::uuid FOR UPDATE`;
    const row = await tx.uploadSession.findUniqueOrThrow({ where: { id: uploadId } });
    // Another request took over a claim it thought stale, or the purge aborted the upload.
    if (row.status !== 'COMPLETING' || row.claimedAt?.getTime() !== claimedAt.getTime()) {
      if (row.status === 'COMPLETED') return this.completedItem(tx, row);
      if (row.status === 'COMPLETING') throw uploadInProgress();
      throw new AppError('UPLOAD_CLOSED', 409);
    }

    if (verdict.kind === 'refuse') return this.close(tx, row, 'REJECTED', verdict.error);
    const refusal = await this.reauthorize(tx, row);
    if (refusal !== null) return this.close(tx, row, 'REJECTED', refusal);

    let frameNo: number;
    try {
      // Takes the collection lock and re-checks it is ACTIVE.
      frameNo = await this.frames.next(tx, row.collectionId);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      return this.close(tx, row, 'REJECTED', error);
    }
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
            mimeType: verdict.mime,
            sizeBytes: BigInt(verdict.size),
          },
        },
      },
    });
    await tx.uploadSession.update({
      where: { id: row.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        claimedAt: null,
        contentItemId: item.id,
      },
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
      sizeBytes: verdict.size,
    });
    return { kind: 'item', contentItemId: item.id };
  }

  /**
   * The guest session's link and collection as they are now, and the permission for this kind:
   * they may have changed while storage was checked.
   */
  private async reauthorize(
    tx: Prisma.TransactionClient,
    row: UploadSession,
  ): Promise<AppError | null> {
    const session = await tx.guestSession.findUniqueOrThrow({
      where: { id: row.guestSessionId },
      include: {
        currentLink: true,
        collection: { select: { status: true, owner: { select: { status: true } } } },
      },
    });
    try {
      assertLinkUsable({ link: session.currentLink, collection: session.collection });
    } catch (error) {
      if (error instanceof AppError) return error;
      throw error;
    }
    const permissions = permissionsOf(session.currentLink);
    const allowed =
      row.kind === 'PHOTO'
        ? permissions.canUploadPhotos
        : row.kind === 'VIDEO'
          ? permissions.canUploadVideos
          : row.kind === 'DOCUMENT' && permissions.canUploadDocuments;
    return allowed ? null : new AppError('FORBIDDEN', 403);
  }

  /** Gives a claim back (the row stays open), unless something else changed it meanwhile. */
  private async release(uploadId: string, claimedAt: Date): Promise<void> {
    await this.prisma.uploadSession.updateMany({
      where: { id: uploadId, status: 'COMPLETING', claimedAt },
      data: { status: 'INITIATED', claimedAt: null },
    });
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

  /** Records the refusal (`REJECTED` or `EXPIRED`) and queues the discard of its bytes. */
  private async close(
    tx: Prisma.TransactionClient,
    row: UploadSession,
    status: 'REJECTED' | 'EXPIRED',
    error: AppError,
  ): Promise<Outcome> {
    await tx.uploadSession.update({
      where: { id: row.id },
      data: {
        status,
        claimedAt: null,
        ...(status === 'REJECTED' ? { rejectReason: error.code } : {}),
      },
    });
    await this.jobs.enqueue(tx, 'storage.discard-upload', { uploadSessionId: row.id });
    this.logger.log({ msg: 'upload refused', uploadSessionId: row.id, status, reason: error.code });
    return { kind: 'refused', error, reason: error.code };
  }
}
