import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import type { JobHandler } from '../job-handler.js';
import { decodeHeic, needsHeifDecoder } from '../media/decode.js';
import { DerivativeStore } from '../media/derivative-store.js';
import { MediaSlots } from '../media/media-slots.js';
import { OriginalSanitizer } from '../media/original-sanitizer.js';
import { renderDerivatives } from '../media/images.js';
import { PermanentMediaError } from '../media/media-error.js';
import { withWorkDir } from '../media/work-dir.js';

/**
 * Removes location metadata from a photo's original (`OriginalSanitizer`, ADR 0008 addendum
 * 2026-10-05), then makes its grid thumbnail (480 px) and viewer preview (1600 px), WebP without
 * metadata (spec §11). The original (≤ 50 MB) is streamed to a temp file, never held in memory;
 * HEIC goes through the libheif CLI first (spike S5). A `READY` photo not sanitised yet (the
 * sweep's backfill) is only sanitised. A file that cannot be sanitised or decoded marks the item
 * `FAILED` at once; other errors are retried, and the last failed attempt marks it `FAILED`.
 */
@Injectable()
export class ImageDerivativesHandler implements JobHandler<'media.image-derivatives'> {
  readonly name = 'media.image-derivatives';
  private readonly logger = new Logger(ImageDerivativesHandler.name);

  constructor(
    private readonly store: DerivativeStore,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly slots: MediaSlots,
    private readonly sanitizer: OriginalSanitizer,
  ) {}

  async handle({ contentItemId }: JobData['media.image-derivatives']): Promise<void> {
    const item = await this.store.source(contentItemId, 'PHOTO');
    if (item === null) return;
    if (item.sanitizedAt !== null && item.processingStatus === 'READY') return;
    try {
      // One media job at a time in the whole worker (memory), whatever its type.
      await this.slots.run(() =>
        withWorkDir(async (dir) => {
          let input = join(dir, 'original');
          const downloaded = await this.storage.downloadToFile(item.storageKey, input);
          if (downloaded === null) {
            throw new PermanentMediaError('original is missing from storage');
          }
          if (item.sanitizedAt === null) {
            const sanitized = await this.sanitizer.item(item, {
              path: input,
              etag: downloaded.etag,
              workDir: dir,
            });
            if (sanitized === null) return;
            input = sanitized;
          }
          // A legacy photo keeps its previews: they never carried metadata.
          if (item.processingStatus === 'READY') return;
          const heic = needsHeifDecoder(item.mimeType);
          const decoded = heic ? await decodeHeic(input, dir) : input;
          // A decoded HEIC is already upright (libheif); everything else follows its EXIF tag.
          const result = await renderDerivatives(decoded, { autoOrient: !heic });
          await this.store.save(
            item,
            { THUMBNAIL: result.thumbnail, PREVIEW: result.large },
            result.source,
          );
        }),
      );
    } catch (error) {
      if (!(error instanceof PermanentMediaError)) throw error;
      this.logger.warn({ msg: 'image cannot be processed', contentItemId, reason: error.message });
      await this.store.markFailed(item.id);
    }
  }

  async onFinalFailure({ contentItemId }: JobData['media.image-derivatives']): Promise<void> {
    await this.store.markFailed(contentItemId);
  }
}
