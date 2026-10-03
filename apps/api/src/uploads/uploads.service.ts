import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CreateUploadRequest,
  fileTypeFor,
  type UploadPartsResponse,
  type UploadSessionResponse,
} from '@stepler/contracts';
import type { GuestPrincipal } from '../auth/principal.js';
import { constraintViolation } from '../database/constraint-violation.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { Prisma, UploadSession } from '../generated/prisma/client.js';
import { canUploadKind } from '../guest-access/guest-policy.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { LimitsService } from '../limits/limits.service.js';
import { UsageService } from '../limits/usage.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { partLength, planUpload, uploadKey } from './upload-plan.js';

const HOUR_MS = 3600_000;
const IDEMPOTENCY_INDEX = 'UploadSession_guestSessionId_clientUploadId_key';

/** Storage could not be reached: the guest may retry (spec §10.5). */
export const storageUnavailable = (cause: unknown): AppError =>
  new AppError('DEPENDENCY_UNAVAILABLE', 503, { retryable: true, cause });

/** Runs a storage call; any failure is `503 DEPENDENCY_UNAVAILABLE` (retryable). */
export async function viaStorage<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw storageUnavailable(error);
  }
}

/** The guest's own upload in this collection; anyone else's is `404` like a missing one. */
export async function findOwnUpload(
  prisma: Pick<Prisma.TransactionClient, 'uploadSession'>,
  p: GuestPrincipal,
  uploadId: string,
): Promise<UploadSession> {
  const row = await prisma.uploadSession.findFirst({
    where: { id: uploadId, collectionId: p.collectionId, guestSessionId: p.guestSessionId },
  });
  if (row === null) throw new AppError('NOT_FOUND', 404);
  return row;
}

/** An open upload, or the error for its state: closed `409`, expired `410`. */
export function assertOpen(row: UploadSession, now = new Date()): void {
  if (row.status === 'EXPIRED' || (row.status === 'INITIATED' && row.expiresAt <= now)) {
    throw new AppError('UPLOAD_EXPIRED', 410);
  }
  if (row.status !== 'INITIATED') throw new AppError('UPLOAD_CLOSED', 409);
}

/**
 * Direct uploads (spec §10.3, ADR 0008): the API authorizes, reserves quota and signs; the
 * browser sends the bytes to storage itself. Every route is scoped to the guest's own uploads in
 * `principal.collectionId`. Presigned URLs are credentials: returned to the guest, never logged.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly usage: UsageService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /**
   * Opens an upload session, or (same `clientUploadId` and file) returns the open one with fresh
   * URLs. Order: type, permission, size, idempotent replay, rate limits, then the quota
   * reservation under the owner lock. Multipart uploads are created in storage before the row:
   * an orphan from a failed insert is aborted by the bucket's lifecycle rule.
   */
  async initiate(p: GuestPrincipal, body: CreateUploadRequest): Promise<UploadSessionResponse> {
    const type = fileTypeFor(body.filename, body.mimeType);
    if (type === null) throw new AppError('FILE_TYPE_NOT_ALLOWED', 422);
    if (!canUploadKind(p, type.kind)) throw new AppError('FORBIDDEN', 403);
    const size = BigInt(body.sizeBytes);
    if (size > this.limits.fileRules().fileBytes[type.kind]) {
      throw new AppError('FILE_TOO_LARGE', 422);
    }

    const existing = await this.prisma.uploadSession.findUnique({
      where: {
        guestSessionId_clientUploadId: {
          guestSessionId: p.guestSessionId,
          clientUploadId: body.clientUploadId,
        },
      },
    });
    if (existing !== null) return this.replay(existing, body);

    await this.assertWithinSessionLimits(p);

    const settings = this.limits.uploads();
    const plan = planUpload(size, {
      singlePutMax: settings.singlePutMaxBytes,
      partSize: settings.partSizeBytes,
    });
    const [{ id }] = await this.prisma.$queryRaw<[{ id: string }]>`SELECT uuidv7()::text AS "id"`;
    const key = uploadKey(p.collectionId, id);
    const multipartUploadId =
      plan.strategy === 'MULTIPART'
        ? await viaStorage(() => this.storage.createMultipart(key, type.canonicalMime))
        : null;

    let row: UploadSession;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const { ownerId } = await tx.collection.findUniqueOrThrow({
          where: { id: p.collectionId },
          select: { ownerId: true },
        });
        await this.usage.lockOwner(tx, ownerId);
        await this.usage.assertCanReserve(tx, {
          userId: ownerId,
          collectionId: p.collectionId,
          bytes: size,
        });
        return tx.uploadSession.create({
          data: {
            id,
            collectionId: p.collectionId,
            guestSessionId: p.guestSessionId,
            guestLinkId: p.link.id,
            clientUploadId: body.clientUploadId,
            kind: type.kind,
            originalFilename: body.filename,
            declaredMime: type.canonicalMime,
            declaredSizeBytes: size,
            storageKey: key,
            strategy: plan.strategy,
            ...(plan.strategy === 'MULTIPART'
              ? {
                  multipartUploadId,
                  partSizeBytes: plan.partSizeBytes,
                  partCount: plan.partCount,
                }
              : {}),
            expiresAt: new Date(Date.now() + settings.sessionTtlHours * HOUR_MS),
          },
        });
      });
    } catch (error) {
      if (multipartUploadId !== null) {
        await this.storage.abortMultipart(key, multipartUploadId).catch(() => undefined);
      }
      // A concurrent retry with the same id won: answer as its replay.
      if (constraintViolation(error)?.constraint === IDEMPOTENCY_INDEX) {
        const winner = await this.prisma.uploadSession.findUnique({
          where: {
            guestSessionId_clientUploadId: {
              guestSessionId: p.guestSessionId,
              clientUploadId: body.clientUploadId,
            },
          },
        });
        if (winner !== null) return this.replay(winner, body);
      }
      throw error;
    }
    this.logger.log({
      msg: 'upload initiated',
      uploadSessionId: row.id,
      collectionId: row.collectionId,
      kind: row.kind,
      strategy: row.strategy,
      sizeBytes: Number(row.declaredSizeBytes),
    });
    return this.describe(row);
  }

  /** URLs for some parts of the guest's open multipart upload; each signs its exact length. */
  async presignParts(
    p: GuestPrincipal,
    uploadId: string,
    partNumbers: readonly number[],
  ): Promise<UploadPartsResponse> {
    const row = await findOwnUpload(this.prisma, p, uploadId);
    assertOpen(row);
    if (
      row.strategy !== 'MULTIPART' ||
      row.multipartUploadId === null ||
      row.partSizeBytes === null ||
      row.partCount === null
    ) {
      throw invalidParts('This upload is a single PUT');
    }
    const { partCount, partSizeBytes, multipartUploadId } = row;
    if (partNumbers.some((n) => n > partCount)) throw invalidParts(`At most ${partCount} parts`);
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
   * Gives an open upload up: `ABORTED`, its reservation freed at once, the bytes discarded by
   * the worker. Idempotent; works even when the link has closed since (it only frees things).
   */
  async cancel(p: GuestPrincipal, uploadId: string): Promise<void> {
    // Started outside the transaction, so a first start never runs while it holds a connection.
    await this.jobs.ready();
    await this.prisma.$transaction(async (tx) => {
      const row = await findOwnUpload(tx, p, uploadId);
      if (row.status === 'ABORTED') return;
      if (row.status === 'COMPLETED') throw new AppError('UPLOAD_CLOSED', 409);
      if (row.status !== 'INITIATED') return; // REJECTED or EXPIRED: already being discarded
      const { count } = await tx.uploadSession.updateMany({
        where: { id: row.id, status: 'INITIATED' },
        data: { status: 'ABORTED' },
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

  /** The same file again: the open session with fresh URLs; otherwise the reason it is not. */
  private replay(row: UploadSession, body: CreateUploadRequest): Promise<UploadSessionResponse> {
    const same =
      row.originalFilename === body.filename && row.declaredSizeBytes === BigInt(body.sizeBytes);
    if (!same) throw new AppError('IDEMPOTENCY_CONFLICT', 409);
    assertOpen(row);
    return this.describe(row);
  }

  private async describe(row: UploadSession): Promise<UploadSessionResponse> {
    const expiresAt = row.expiresAt.toISOString();
    if (row.strategy === 'MULTIPART' && row.partSizeBytes !== null && row.partCount !== null) {
      return {
        uploadId: row.id,
        strategy: 'MULTIPART',
        partSizeBytes: Number(row.partSizeBytes),
        partCount: row.partCount,
        expiresAt,
      };
    }
    const url = await viaStorage(() =>
      this.storage.presignPut(row.storageKey, {
        contentType: row.declaredMime,
        contentLength: Number(row.declaredSizeBytes),
        expiresInSeconds: this.limits.uploads().urlTtlSeconds,
      }),
    );
    return {
      uploadId: row.id,
      strategy: 'SINGLE',
      url,
      headers: { 'content-type': row.declaredMime },
      expiresAt,
    };
  }

  /**
   * Initiations in the last hour (all statuses: cancelling must not reset the count) and open
   * uploads now, per guest session (spec §13.1). Concurrent requests may overshoot by their
   * number: a bound on load; the quota is enforced under the owner lock instead.
   */
  private async assertWithinSessionLimits(p: GuestPrincipal): Promise<void> {
    const limits = this.limits.forGuestSession();
    const since = new Date(Date.now() - HOUR_MS);
    const [recent, open] = await Promise.all([
      this.prisma.uploadSession.aggregate({
        where: { guestSessionId: p.guestSessionId, createdAt: { gt: since } },
        _count: { _all: true },
        _min: { createdAt: true },
      }),
      this.prisma.uploadSession.count({
        where: {
          guestSessionId: p.guestSessionId,
          status: 'INITIATED',
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
    if (recent._count._all >= limits.uploadInitiationsPerHour) {
      const oldest = recent._min.createdAt?.getTime() ?? Date.now();
      throw new AppError('RATE_LIMITED', 429, {
        retryable: true,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + HOUR_MS - Date.now()) / 1000)),
      });
    }
    if (open >= limits.concurrentUploads) {
      throw new AppError('RATE_LIMITED', 429, { retryable: true, retryAfterSeconds: 5 });
    }
  }
}

const invalidParts = (message: string) =>
  new AppError('VALIDATION_FAILED', 400, { errors: [{ path: ['partNumbers'], message }] });
