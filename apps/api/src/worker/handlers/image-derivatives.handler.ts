import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import type { JobHandler } from '../job-handler.js';
import { decodeHeic, needsHeifDecoder } from '../media/decode.js';
import { DerivativeStore } from '../media/derivative-store.js';
import { MediaSlots } from '../media/media-slots.js';
import { renderDerivatives } from '../media/images.js';
import { PermanentMediaError } from '../media/media-error.js';
import { withWorkDir } from '../media/work-dir.js';

/**
 * Makes a photo's grid thumbnail (480 px) and viewer preview (1600 px), WebP without metadata
 * (spec §11). The original (≤ 50 MB) is streamed to a temp file, never held in memory; HEIC
 * goes through the libheif CLI first (spike S5). A file that cannot be decoded marks the item
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
  ) {}

  async handle({ contentItemId }: JobData['media.image-derivatives']): Promise<void> {
    const item = await this.store.source(contentItemId, 'PHOTO');
    if (item === null) return;
    try {
      // One media job at a time in the whole worker (memory), whatever its type.
      await this.slots.run(() =>
        withWorkDir(async (dir) => {
          const input = join(dir, 'original');
          if (!(await this.storage.downloadToFile(item.storageKey, input))) {
            throw new PermanentMediaError('original is missing from storage');
          }
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
