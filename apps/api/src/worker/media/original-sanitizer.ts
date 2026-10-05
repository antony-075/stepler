import { stat } from 'node:fs/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { CollectionImage } from '../../generated/prisma/client.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import type { MediaSource } from './derivative-store.js';
import { type StripResult, stripLocation } from './location.js';
import { PermanentMediaError } from './media-error.js';

/** An original the worker has downloaded: where it is, and which stored version it was. */
export interface DownloadedOriginal {
  path: string;
  etag: string;
  workDir: string;
}

type ImageSource = Pick<CollectionImage, 'id' | 'mimeType'>;

/** The original as it is stored after this step. */
interface Stored {
  path: string;
  sizeBytes: number;
  rewritten: boolean;
}

/**
 * The first step of every media job (ADR 0008 addendum 2026-10-05): removes location metadata
 * from the downloaded original (`location.ts`), puts the result back under the SAME key only if
 * the stored object is still the version that was downloaded (`If-Match`), then records
 * `sanitizedAt` and the new size (usage is the sum of stored sizes) in one short transaction.
 * Idempotent: the stored original is replaced whole or not at all, and a rerun of a sanitised
 * row is skipped by its caller. A file that cannot be sanitised marks the row `FAILED` (even a
 * `READY` one, during the backfill), so guests never get its original.
 */
@Injectable()
export class OriginalSanitizer {
  private readonly logger = new Logger(OriginalSanitizer.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * A content item's original. Returns the sanitised file (the download itself when nothing had
   * to go), or `null` when the item was deleted meanwhile (nothing recorded).
   */
  async item(item: MediaSource, original: DownloadedOriginal): Promise<string | null> {
    const result = await this.strip(original, item.mimeType, () =>
      this.prisma.contentItem.updateMany({
        where: { id: item.id, sanitizedAt: null },
        data: { processingStatus: 'FAILED' },
      }),
    );
    const stored = await this.replace(item.storageKey, item.mimeType, original, result);
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
        data: { sizeBytes: BigInt(stored.sizeBytes) },
      });
      return true;
    });
    // Deleted while it was sanitised: the purge may have run already; the rewrite must not stay.
    if (!recorded && stored.rewritten) await this.storage.delete(item.storageKey);
    this.log('content item', item.id, stored, recorded);
    return recorded ? stored.path : null;
  }

  /** An admin image's original, as `item`; `null` when the image was dropped meanwhile. */
  async image(
    image: ImageSource,
    key: string,
    original: DownloadedOriginal,
  ): Promise<string | null> {
    const result = await this.strip(original, image.mimeType, () =>
      this.prisma.collectionImage.updateMany({
        where: { id: image.id, sanitizedAt: null },
        data: { status: 'FAILED' },
      }),
    );
    const stored = await this.replace(key, image.mimeType, original, result);
    const { count } = await this.prisma.collectionImage.updateMany({
      where: { id: image.id },
      data: { sanitizedAt: new Date(), originalSizeBytes: BigInt(stored.sizeBytes) },
    });
    // Dropped meanwhile: its `collection-image.purge` may have run already.
    if (count === 0 && stored.rewritten) await this.storage.delete(key);
    this.log('collection image', image.id, stored, count > 0);
    return count > 0 ? stored.path : null;
  }

  private async strip(
    original: DownloadedOriginal,
    mimeType: string,
    markFailed: () => Promise<unknown>,
  ): Promise<StripResult> {
    try {
      return await stripLocation(original.path, mimeType, original.workDir);
    } catch (error) {
      if (error instanceof PermanentMediaError) await markFailed();
      throw error;
    }
  }

  /**
   * Puts the sanitised file in place of the original, when stripping changed it. Returns the
   * file now stored and its size, which is recorded either way: a run that crashed after the
   * upload leaves a smaller object that its rerun finds clean.
   */
  private async replace(
    key: string,
    mimeType: string,
    original: DownloadedOriginal,
    result: StripResult,
  ): Promise<Stored> {
    const path = result.changed ? result.path : original.path;
    const { size } = await stat(path);
    if (!result.changed) return { path, sizeBytes: size, rewritten: false };
    if (!(await this.storage.replaceFromFile(key, path, mimeType, original.etag))) {
      // Deleted (or, in principle, rewritten) since the download: retried, and the rerun finds
      // the row deleted or the stored object clean.
      throw new Error('the original changed while it was sanitised');
    }
    return { path, sizeBytes: size, rewritten: true };
  }

  private log(target: string, id: string, stored: Stored, recorded: boolean): void {
    this.logger.log({
      msg: 'original sanitised',
      target,
      id,
      locationRemoved: stored.rewritten,
      sizeBytes: stored.sizeBytes,
      recorded,
    });
  }
}
