import { Inject, Injectable, Logger } from '@nestjs/common';
import type { JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import type { JobHandler } from '../job-handler.js';
import { DerivativeStore } from '../media/derivative-store.js';
import { MediaSlots } from '../media/media-slots.js';
import { extractFrame, posterTime, probeVideo } from '../media/ffmpeg.js';
import { renderDerivatives } from '../media/images.js';
import { PermanentMediaError } from '../media/media-error.js';

/** Long enough for a slow probe plus a frame, short enough to be useless if it leaked. */
const SOURCE_URL_TTL_SECONDS = 900;

/**
 * Makes a video's poster (1600 px) and grid thumbnail (480 px) from one frame, and records its
 * duration and displayed size (spec §11). ffmpeg reads the original through a short-lived
 * presigned URL (`ffmpeg.ts`); nothing is downloaded. A file ffmpeg cannot read marks the item
 * `FAILED` at once (the frame then shows ▶ without a poster, D4); other errors are retried, and
 * the last failed attempt marks it `FAILED`.
 */
@Injectable()
export class VideoPosterHandler implements JobHandler<'media.video-poster'> {
  readonly name = 'media.video-poster';
  private readonly logger = new Logger(VideoPosterHandler.name);

  constructor(
    private readonly store: DerivativeStore,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly slots: MediaSlots,
  ) {}

  async handle({ contentItemId }: JobData['media.video-poster']): Promise<void> {
    const item = await this.store.source(contentItemId, 'VIDEO');
    if (item === null) return;
    try {
      // One media job at a time in the whole worker (memory), whatever its type.
      await this.slots.run(async () => {
        const url = await this.storage.presignGet(item.storageKey, {
          expiresInSeconds: SOURCE_URL_TTL_SECONDS,
        });
        const probe = await probeVideo(url);
        const frame = await extractFrame(url, posterTime(probe.durationMs));
        // ffmpeg has already turned the frame upright.
        const result = await renderDerivatives(frame, { autoOrient: false });
        await this.store.save(
          item,
          { THUMBNAIL: result.thumbnail, POSTER: result.large },
          { width: probe.width, height: probe.height, durationMs: probe.durationMs },
        );
      });
    } catch (error) {
      if (!(error instanceof PermanentMediaError)) throw error;
      this.logger.warn({ msg: 'video cannot be processed', contentItemId, reason: error.message });
      await this.store.markFailed(item.id);
    }
  }

  async onFinalFailure({ contentItemId }: JobData['media.video-poster']): Promise<void> {
    await this.store.markFailed(contentItemId);
  }
}
