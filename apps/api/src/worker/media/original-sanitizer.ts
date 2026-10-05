import { rm, stat } from 'node:fs/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { CollectionImage } from '../../generated/prisma/client.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import type { MediaSource } from './derivative-store.js';
import { stripLocation } from './location.js';
import { PermanentMediaError } from './media-error.js';

/** An original the worker has downloaded: where it is, and which stored version it was. */
export interface DownloadedOriginal {
  path: string;
  etag: string;
  workDir: string;
}

/** The outcome of `prepare`, before anything is stored. */
export type Prepared =
  /** The file to keep (`rewritten`: the sanitised copy, else the download as it was). */
  | { kind: 'clean'; path: string; rewritten: boolean }
  /** It cannot be sanitised; that is already recorded (`sanitizeFailedAt`). */
  | { kind: 'unsanitizable' };

type Clean = Extract<Prepared, { kind: 'clean' }>;

/** Neither sanitised nor given up yet. */
export const needsSanitizing = (row: {
  sanitizedAt: Date | null;
  sanitizeFailedAt: Date | null;
}): boolean => row.sanitizedAt === null && row.sanitizeFailedAt === null;

type ImageSource = Pick<CollectionImage, 'id' | 'mimeType'>;

/**
 * The first step of every media job (ADR 0008 addendum 2026-10-05), in two halves so a photo's
 * previews can be rendered from the sanitised file before anything is stored:
 * - `prepare` removes location metadata from the downloaded original (`location.ts`, which also
 *   checks the rewrite kept the image or every stream). A file it cannot sanitise is recorded
 *   (`giveUp*`: `sanitizeFailedAt`; a video also becomes `FAILED`) and the job goes on without;
 * - `commitItem`/`commitImage` put the sanitised file back under the SAME key only while the
 *   stored object is still the downloaded version (`If-Match`), then record `sanitizedAt` and
 *   the stored size (usage is the sum of stored sizes) in one short transaction.
 * Idempotent: the stored original is replaced whole or not at all, and a row with an outcome is
 * skipped by its job. The jobs' last failed retry calls `giveUp*` too, so the backfill stops.
 */
@Injectable()
export class OriginalSanitizer {
  private readonly logger = new Logger(OriginalSanitizer.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * Strips the downloaded original. `giveUp` records a file that cannot be sanitised. A rewrite
   * frees the download at once (a 2 GB video must not keep two copies on disk while uploading).
   */
  async prepare(
    original: DownloadedOriginal,
    mimeType: string,
    giveUp: () => Promise<void>,
  ): Promise<Prepared> {
    try {
      const result = await stripLocation(original.path, mimeType, original.workDir);
      if (!result.changed) return { kind: 'clean', path: original.path, rewritten: false };
      await rm(original.path, { force: true });
      return { kind: 'clean', path: result.path, rewritten: true };
    } catch (error) {
      if (!(error instanceof PermanentMediaError)) throw error;
      this.logger.warn({ msg: 'original cannot be sanitised', reason: error.message });
      await giveUp();
      return { kind: 'unsanitizable' };
    }
  }

  /** A content item's original. `false` when the item was deleted meanwhile (nothing recorded). */
  async commitItem(
    item: MediaSource,
    original: DownloadedOriginal,
    clean: Clean,
  ): Promise<boolean> {
    const sizeBytes = await this.replace(item.storageKey, item.mimeType, original, clean);
    const recorded = await this.prisma.$transaction(async (tx) => {
      // Locks the item row: a concurrent delete commits before (nothing recorded) or after
      // (its purge removes the object written here).
      const { count } = await tx.contentItem.updateMany({
        where: { id: item.id, deletedAt: null },
        data: { sanitizedAt: new Date() },
      });
      if (count === 0) return false;
      await tx.mediaObject.updateMany({
        where: { contentItemId: item.id, role: 'ORIGINAL' },
        data: { sizeBytes: BigInt(sizeBytes) },
      });
      return true;
    });
    // Deleted while it was sanitised: the purge may have run already; the rewrite must not stay.
    if (!recorded && clean.rewritten) await this.storage.delete(item.storageKey);
    this.log('content item', item.id, clean.rewritten, sizeBytes, recorded);
    return recorded;
  }

  /** An admin image's original, as `commitItem`; `false` when the image was dropped meanwhile. */
  async commitImage(
    image: ImageSource,
    key: string,
    original: DownloadedOriginal,
    clean: Clean,
  ): Promise<boolean> {
    const sizeBytes = await this.replace(key, image.mimeType, original, clean);
    const { count } = await this.prisma.collectionImage.updateMany({
      where: { id: image.id },
      data: { sanitizedAt: new Date(), originalSizeBytes: BigInt(sizeBytes) },
    });
    // Dropped meanwhile: its `collection-image.purge` may have run already.
    if (count === 0 && clean.rewritten) await this.storage.delete(key);
    this.log('collection image', image.id, clean.rewritten, sizeBytes, count > 0);
    return count > 0;
  }

  /**
   * The item's original will not be sanitised: it stays the admin's only, and the backfill skips
   * it. A video also becomes `FAILED` (guests could not play it); a photo keeps its previews,
   * which never carry metadata.
   */
  async giveUpItem(contentItemId: string, kind: 'PHOTO' | 'VIDEO'): Promise<void> {
    await this.prisma.contentItem.updateMany({
      where: { id: contentItemId, sanitizedAt: null, sanitizeFailedAt: null },
      data: {
        sanitizeFailedAt: new Date(),
        ...(kind === 'VIDEO' ? { processingStatus: 'FAILED' as const } : {}),
      },
    });
  }

  /** An admin image's original will not be sanitised (it is never served anyway). */
  async giveUpImage(imageId: string): Promise<void> {
    await this.prisma.collectionImage.updateMany({
      where: { id: imageId, sanitizedAt: null, sanitizeFailedAt: null },
      data: { sanitizeFailedAt: new Date() },
    });
  }

  /**
   * Puts the sanitised file in place of the original, when stripping changed it. Returns the
   * size of the file now stored, which is recorded either way: a run that crashed after the
   * upload leaves a smaller object that its rerun finds clean.
   */
  private async replace(
    key: string,
    mimeType: string,
    original: DownloadedOriginal,
    clean: Clean,
  ): Promise<number> {
    const { size } = await stat(clean.path);
    if (!clean.rewritten) return size;
    if (!(await this.storage.replaceFromFile(key, clean.path, mimeType, original.etag))) {
      // Deleted (or, in principle, rewritten) since the download: retried, and the rerun finds
      // the row deleted or the stored object clean.
      throw new Error('the original changed while it was sanitised');
    }
    return size;
  }

  private log(
    target: string,
    id: string,
    rewritten: boolean,
    sizeBytes: number,
    recorded: boolean,
  ): void {
    this.logger.log({
      msg: 'original sanitised',
      target,
      id,
      locationRemoved: rewritten,
      sizeBytes,
      recorded,
    });
  }
}
