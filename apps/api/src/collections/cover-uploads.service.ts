import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type Collection,
  type CreateUploadRequest,
  fileTypeFor,
  type UploadPartsResponse,
  type UploadSessionResponse,
} from '@stepler/contracts';
import type { AccountPrincipal } from '../auth/principal.js';
import { constraintViolation } from '../database/constraint-violation.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma, UploadSession } from '../generated/prisma/client.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { LimitsService } from '../limits/limits.service.js';
import { UsageService } from '../limits/usage.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { UploadInspector, type Verdict } from '../uploads/upload-inspector.js';
import { partLength, planUpload, staleClaimBefore, uploadKey } from '../uploads/upload-plan.js';
import {
  assertOpen,
  isBeingCompleted,
  uploadInProgress,
  viaStorage,
} from '../uploads/uploads.service.js';
import { CollectionsService } from './collections.service.js';
import { coverKey } from './cover-keys.js';
import { CoversService } from './covers.service.js';

const HOUR_MS = 3600_000;
const IDEMPOTENCY_INDEX = 'UploadSession_uploaderUserId_clientUploadId_key';

/** Cover uploads open at once per collection [A9]: a bound on load, not a quota. */
export const MAX_OPEN_COVER_UPLOADS = 3;

/** What a short transaction decided; errors are thrown after it commits. */
type Outcome =
  | { kind: 'done' }
  | { kind: 'claimed'; claimedAt: Date; row: UploadSession }
  | { kind: 'refused'; error: AppError };

/**
 * The admin's cover file travels like a guest's (spec §10, ADR 0008 addendum 2026-10-04): an
 * `UploadSession` with `purpose = COVER` and `uploaderUserId`, a multipart upload the browser
 * sends parts to, a claimed completion that inspects storage outside any transaction. What
 * differs is the scope (the owner's own collection and own uploads, else `404`) and the result:
 * the verified original is copied into the cover's own prefix and the cover row replaced
 * (`CoversService.replace`), never a content frame. Presigned URLs are credentials: never logged.
 */
@Injectable()
export class CoverUploadsService {
  private readonly logger = new Logger(CoverUploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly usage: UsageService,
    private readonly covers: CoversService,
    private readonly collections: CollectionsService,
    private readonly inspector: UploadInspector,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /**
   * Opens a cover upload, or (same `clientUploadId` and file) returns the open one. Order: type
   * (photos only), size, scope, idempotent replay, the open-uploads cap, then the quota
   * reservation under the owner lock and the collection lock [C9]. The multipart upload is
   * created in storage before the row; a failed insert aborts it.
   */
  async initiate(
    a: AccountPrincipal,
    collectionId: string,
    body: CreateUploadRequest,
  ): Promise<UploadSessionResponse> {
    const type = fileTypeFor(body.filename, body.mimeType);
    if (type === null || type.kind !== 'PHOTO') throw new AppError('FILE_TYPE_NOT_ALLOWED', 422);
    const size = BigInt(body.sizeBytes);
    if (size > this.limits.fileRules().fileBytes.PHOTO) throw new AppError('FILE_TOO_LARGE', 422);

    // Scope before anything else: another owner's collection is 404, replay included.
    const collection = await this.findOwned(a, collectionId);
    const existing = await this.findByClientId(a, body.clientUploadId);
    if (existing !== null) {
      if (existing.collectionId !== collection.id) throw new AppError('IDEMPOTENCY_CONFLICT', 409);
      return this.replay(existing, body);
    }
    if (collection.status === 'ARCHIVED') throw new AppError('COLLECTION_ARCHIVED', 409);
    const open = await this.prisma.uploadSession.count({
      where: {
        collectionId: collection.id,
        purpose: 'COVER',
        status: { in: ['INITIATED', 'COMPLETING'] },
        expiresAt: { gt: new Date() },
      },
    });
    if (open >= MAX_OPEN_COVER_UPLOADS) {
      throw new AppError('RATE_LIMITED', 429, { retryable: true, retryAfterSeconds: 5 });
    }

    const settings = this.limits.uploads();
    const plan = planUpload(size, settings.partSizeBytes);
    const id = await this.newId();
    const key = uploadKey(collection.id, id);
    const multipartUploadId = await viaStorage(() =>
      this.storage.createMultipart(key, type.canonicalMime),
    );

    let row: UploadSession;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        await this.usage.lockOwner(tx, collection.ownerId);
        const locked = await this.covers.lockMutable(tx, a, collection.id);
        await this.usage.assertCanReserve(tx, {
          userId: locked.ownerId,
          collectionId: locked.id,
          bytes: size,
        });
        return tx.uploadSession.create({
          data: {
            id,
            collectionId: locked.id,
            purpose: 'COVER',
            uploaderUserId: a.userId,
            clientUploadId: body.clientUploadId,
            kind: 'PHOTO',
            originalFilename: body.filename,
            declaredMime: type.canonicalMime,
            declaredSizeBytes: size,
            storageKey: key,
            multipartUploadId,
            partSizeBytes: plan.partSizeBytes,
            partCount: plan.partCount,
            expiresAt: new Date(Date.now() + settings.sessionTtlHours * HOUR_MS),
          },
        });
      });
    } catch (error) {
      await this.storage.abortMultipart(key, multipartUploadId).catch(() => undefined);
      // A concurrent retry with the same id won: answer as its replay (as the guest flow does).
      const code = error instanceof AppError ? error.code : undefined;
      if (
        constraintViolation(error)?.constraint === IDEMPOTENCY_INDEX ||
        code === 'QUOTA_EXCEEDED'
      ) {
        const winner = await this.findByClientId(a, body.clientUploadId);
        if (winner !== null && winner.collectionId === collection.id) {
          return this.replay(winner, body);
        }
      }
      throw error;
    }
    this.logger.log({
      msg: 'cover upload initiated',
      uploadSessionId: row.id,
      collectionId: row.collectionId,
      partCount: row.partCount,
      sizeBytes: Number(row.declaredSizeBytes),
    });
    return this.describe(row);
  }

  /** URLs for some parts of the admin's open cover upload; each signs its exact length. */
  async presignParts(
    a: AccountPrincipal,
    collectionId: string,
    uploadId: string,
    partNumbers: readonly number[],
  ): Promise<UploadPartsResponse> {
    const row = await this.findCoverUpload(this.prisma, a, collectionId, uploadId);
    assertOpen(row);
    const { partCount, partSizeBytes, multipartUploadId } = row;
    if (partNumbers.some((n) => n > partCount)) {
      throw new AppError('VALIDATION_FAILED', 400, {
        errors: [{ path: ['partNumbers'], message: `At most ${partCount} parts` }],
      });
    }
    const ttl = this.limits.uploads().urlTtlSeconds;
    const parts = await viaStorage(() =>
      Promise.all(
        partNumbers.map(async (partNumber) => ({
          partNumber,
          url: await this.storage.presignPart(
            row.storageKey,
            multipartUploadId,
            partNumber,
            Number(partLength(row.declaredSizeBytes, partSizeBytes, partNumber)),
            ttl,
          ),
        })),
      ),
    );
    return { parts, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  /**
   * Gives an open cover upload up: `ABORTED`, its reservation freed at once, the bytes discarded
   * by the worker. Idempotent; allowed on an archived collection (it only frees things). While a
   * completion is checking it: `409 UPLOAD_IN_PROGRESS`.
   */
  async cancel(a: AccountPrincipal, collectionId: string, uploadId: string): Promise<void> {
    // Started outside the transaction, so a first start never runs while it holds a connection.
    await this.jobs.ready();
    await this.prisma.$transaction(async (tx) => {
      const row = await this.findCoverUpload(tx, a, collectionId, uploadId);
      if (row.status === 'ABORTED') return;
      if (row.status === 'COMPLETED') throw new AppError('UPLOAD_CLOSED', 409);
      if (isBeingCompleted(row)) throw uploadInProgress();
      if (row.status !== 'INITIATED' && row.status !== 'COMPLETING') return; // being discarded
      const { count } = await tx.uploadSession.updateMany({
        where: {
          id: row.id,
          OR: [
            { status: 'INITIATED' },
            { status: 'COMPLETING', claimedAt: { lt: staleClaimBefore() } },
          ],
        },
        data: { status: 'ABORTED', claimedAt: null },
      });
      if (count === 0) {
        // A completion took it meanwhile.
        const now = await tx.uploadSession.findUniqueOrThrow({ where: { id: row.id } });
        if (now.status === 'COMPLETED') throw new AppError('UPLOAD_CLOSED', 409);
        return;
      }
      await this.jobs.enqueue(tx, 'storage.discard-upload', { uploadSessionId: row.id });
    });
  }

  /**
   * Completes the cover upload (spec §10.4, three steps like a guest's): claim → inspect storage
   * outside any transaction → copy the verified original into the cover's prefix → a short
   * transaction that re-checks the claim, locks the collection and replaces the cover
   * (`COMPLETED`, no content item). A repeat of a finished completion returns the collection as
   * it is now (the cover may have been replaced since); it never copies again. The upload's own
   * key is deleted best-effort after commit (the collection purge is the backstop).
   */
  async complete(a: AccountPrincipal, collectionId: string, uploadId: string): Promise<Collection> {
    await this.jobs.ready();
    const claim = await this.prisma.$transaction((tx) => this.claim(tx, a, collectionId, uploadId));
    if (claim.kind !== 'claimed') return this.finish(a, collectionId, claim);

    let verdict: Verdict;
    try {
      verdict = await this.inspector.inspect(claim.row);
    } catch (error) {
      // Missing parts or storage trouble: give the claim back so the admin can retry at once.
      await this.release(claim.row.id, claim.claimedAt);
      throw error;
    }
    if (verdict.kind === 'refuse') {
      const refusal = verdict.error;
      const outcome = await this.prisma.$transaction((tx) =>
        this.record(tx, a, claim.row.id, claim.claimedAt, (row) =>
          this.close(tx, row, 'REJECTED', refusal),
        ),
      );
      return this.finish(a, collectionId, outcome);
    }

    const coverId = await this.newId();
    const original = coverKey(claim.row.collectionId, coverId, 'original');
    try {
      await viaStorage(() => this.storage.copyObject(claim.row.storageKey, original, verdict.mime));
    } catch (error) {
      await this.release(claim.row.id, claim.claimedAt);
      throw error;
    }
    let outcome: Outcome;
    try {
      outcome = await this.prisma.$transaction((tx) =>
        this.record(tx, a, claim.row.id, claim.claimedAt, async (row) => {
          let locked: { id: string };
          try {
            locked = await this.covers.lockMutable(tx, a, row.collectionId);
          } catch (error) {
            // Archived or deleted while storage was checked: the refusal is recorded (D8).
            if (!(error instanceof AppError)) throw error;
            return this.close(tx, row, 'REJECTED', error);
          }
          await this.covers.replace(tx, locked.id, {
            id: coverId,
            source: 'UPLOAD',
            mimeType: verdict.mime,
            originalSizeBytes: BigInt(verdict.size),
          });
          await tx.uploadSession.update({
            where: { id: row.id },
            data: { status: 'COMPLETED', completedAt: new Date(), claimedAt: null },
          });
          this.logger.log({
            msg: 'cover upload completed',
            uploadSessionId: row.id,
            collectionId: locked.id,
            coverId,
            sizeBytes: verdict.size,
          });
          return { kind: 'done' };
        }),
      );
    } catch (error) {
      // Nothing recorded: the copy has no row and goes.
      await this.storage.delete(original).catch(() => undefined);
      throw error;
    }
    if (outcome.kind === 'done') {
      await this.storage.delete(claim.row.storageKey).catch((error: unknown) => {
        this.logger.warn({
          msg: 'cover upload key not deleted after completion',
          uploadSessionId: claim.row.id,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      });
    } else {
      // The refusal was recorded without this copy; its discard job removes the upload's key.
      await this.storage.delete(original).catch(() => undefined);
    }
    return this.finish(a, collectionId, outcome);
  }

  private async finish(
    a: AccountPrincipal,
    collectionId: string,
    outcome: Outcome,
  ): Promise<Collection> {
    if (outcome.kind === 'refused') throw outcome.error;
    if (outcome.kind === 'claimed') throw new Error('unreachable: an unfinished claim');
    return this.collections.read(a, collectionId);
  }

  /** Step 1: state checks under the row lock, then the claim. */
  private async claim(
    tx: Prisma.TransactionClient,
    a: AccountPrincipal,
    collectionId: string,
    uploadId: string,
  ): Promise<Outcome> {
    // Scope first (another admin's upload is 404), then lock the row and read it again.
    const own = await this.findCoverUpload(tx, a, collectionId, uploadId);
    await tx.$queryRaw`SELECT 1 FROM "UploadSession" WHERE "id" = ${own.id}::uuid FOR UPDATE`;
    const row = await tx.uploadSession.findUniqueOrThrow({ where: { id: own.id } });

    if (row.status === 'COMPLETED') return { kind: 'done' };
    if (row.status === 'ABORTED' || row.status === 'REJECTED') {
      throw new AppError('UPLOAD_CLOSED', 409);
    }
    if (row.status === 'EXPIRED') throw new AppError('UPLOAD_EXPIRED', 410);
    if (isBeingCompleted(row)) throw uploadInProgress();
    if (row.expiresAt <= new Date()) {
      return this.close(tx, row, 'EXPIRED', new AppError('UPLOAD_EXPIRED', 410));
    }
    // Re-checked now [A6]: a collection archived since initiation takes no cover.
    const collection = await tx.collection.findUniqueOrThrow({
      where: { id: row.collectionId },
      select: { status: true },
    });
    if (collection.status === 'ARCHIVED') {
      return this.close(tx, row, 'REJECTED', new AppError('COLLECTION_ARCHIVED', 409));
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

  /** Step 3: if the claim still holds, `then` records the result or the refusal. */
  private async record(
    tx: Prisma.TransactionClient,
    a: AccountPrincipal,
    uploadId: string,
    claimedAt: Date,
    then: (row: UploadSession) => Promise<Outcome>,
  ): Promise<Outcome> {
    await tx.$queryRaw`SELECT 1 FROM "UploadSession" WHERE "id" = ${uploadId}::uuid FOR UPDATE`;
    const row = await tx.uploadSession.findFirst({
      where: { id: uploadId, purpose: 'COVER', uploaderUserId: a.userId },
    });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    // Another request took over a claim it thought stale, or the purge aborted the upload.
    if (row.status !== 'COMPLETING' || row.claimedAt?.getTime() !== claimedAt.getTime()) {
      if (row.status === 'COMPLETED') return { kind: 'done' };
      if (row.status === 'COMPLETING') throw uploadInProgress();
      throw new AppError('UPLOAD_CLOSED', 409);
    }
    return then(row);
  }

  /** Gives a claim back (the row stays open), unless something else changed it meanwhile. */
  private async release(uploadId: string, claimedAt: Date): Promise<void> {
    await this.prisma.uploadSession.updateMany({
      where: { id: uploadId, status: 'COMPLETING', claimedAt },
      data: { status: 'INITIATED', claimedAt: null },
    });
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
    this.logger.log({
      msg: 'cover upload refused',
      uploadSessionId: row.id,
      status,
      reason: error.code,
    });
    return { kind: 'refused', error };
  }

  /**
   * The admin's own cover upload in their own collection; anything else (another admin's
   * upload, a guest's upload, another collection, a `DELETING` one) is `404` like a missing one.
   */
  private async findCoverUpload(
    prisma: Pick<Prisma.TransactionClient, 'uploadSession'>,
    a: AccountPrincipal,
    collectionId: string,
    uploadId: string,
  ): Promise<UploadSession> {
    const row = await prisma.uploadSession.findFirst({
      where: {
        id: uploadId,
        purpose: 'COVER',
        uploaderUserId: a.userId,
        collectionId,
        collection: { ownerId: a.userId, status: { not: 'DELETING' } },
      },
    });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    return row;
  }

  private findByClientId(
    a: AccountPrincipal,
    clientUploadId: string,
  ): Promise<UploadSession | null> {
    return this.prisma.uploadSession.findUnique({
      where: { uploaderUserId_clientUploadId: { uploaderUserId: a.userId, clientUploadId } },
    });
  }

  /** The owner's collection that still exists for them, with the id as stored. */
  private async findOwned(a: AccountPrincipal, collectionId: string) {
    const row = await this.prisma.collection.findFirst({
      where: { id: collectionId, ownerId: a.userId, status: { not: 'DELETING' } },
      select: { id: true, ownerId: true, status: true },
    });
    if (row === null) throw new AppError('NOT_FOUND', 404);
    return row;
  }

  /** The same file again: the open session with fresh URLs; otherwise the reason it is not. */
  private replay(row: UploadSession, body: CreateUploadRequest): UploadSessionResponse {
    const same =
      row.originalFilename === body.filename && row.declaredSizeBytes === BigInt(body.sizeBytes);
    if (!same) throw new AppError('IDEMPOTENCY_CONFLICT', 409);
    assertOpen(row);
    return this.describe(row);
  }

  private describe(row: UploadSession): UploadSessionResponse {
    return {
      uploadId: row.id,
      partSizeBytes: Number(row.partSizeBytes),
      partCount: row.partCount,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  /** A UUIDv7 from the database, like every other id (keys are built from it before the row). */
  private async newId(): Promise<string> {
    const [{ id }] = await this.prisma.$queryRaw<[{ id: string }]>`SELECT uuidv7()::text AS "id"`;
    return id;
  }
}
