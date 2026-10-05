import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import type { JobHandler } from '../job-handler.js';
import { DerivativeStore } from '../media/derivative-store.js';
import { MediaSlots } from '../media/media-slots.js';
import { needsSanitizing, OriginalSanitizer } from '../media/original-sanitizer.js';
import { withWorkDir } from '../media/work-dir.js';
import { extractFrame, posterTime, probeVideo } from '../media/ffmpeg.js';
import { renderDerivatives } from '../media/images.js';
import { PermanentMediaError } from '../media/media-error.js';

/** Long enough for a slow probe plus a frame, short enough to be useless if it leaked. */
const SOURCE_URL_TTL_SECONDS = 900;

/**
 * Removes location metadata from a video's original (`OriginalSanitizer`, ADR 0008 addendum
 * 2026-10-05): the original (≤ 2 GB) is downloaded to a temp file for that, once. Then makes its
 * poster (1600 px) and grid thumbnail (480 px) from one frame, and records its duration and
 * displayed size (spec §11): ffmpeg reads the sanitised original through a short-lived presigned
 * URL (`ffmpeg.ts`). A `READY` video not sanitised yet (the sweep's backfill) is only sanitised.
 * A file that cannot be sanitised or read marks the item `FAILED` at once (the frame then shows
 * ▶ without a poster, D4); other errors are retried, and the last failed attempt marks it
 * `FAILED`.
 */
@Injectable()
export class VideoPosterHandler implements JobHandler<'media.video-poster'> {
  readonly name = 'media.video-poster';
  private readonly logger = new Logger(VideoPosterHandler.name);

  constructor(
    private readonly store: DerivativeStore,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly slots: MediaSlots,
    private readonly sanitizer: OriginalSanitizer,
  ) {}

  async handle({ contentItemId }: JobData['media.video-poster']): Promise<void> {
    const item = await this.store.source(contentItemId, 'VIDEO');
    if (item === null) return;
    if (item.processingStatus === 'READY' && !needsSanitizing(item)) return;
    try {
      // One media job at a time in the whole worker (memory), whatever its type.
      await this.slots.run(async () => {
        if (needsSanitizing(item)) {
          const live = await withWorkDir(async (dir) => {
            const input = join(dir, 'original');
            const downloaded = await this.storage.downloadToFile(item.storageKey, input);
            if (downloaded === null) {
              throw new PermanentMediaError('original is missing from storage');
            }
            const original = { path: input, etag: downloaded.etag, workDir: dir };
            const prepared = await this.sanitizer.prepare(original, item.mimeType, () =>
              this.sanitizer.giveUpItem(item.id, 'VIDEO'),
            );
            // A video that cannot be sanitised is FAILED: guests could not play it.
            if (prepared.kind === 'unsanitizable') return false;
            return this.sanitizer.commitItem(item, original, prepared);
          });
          if (!live) return;
        }
        // A legacy video keeps its poster: it never carried metadata.
        if (item.processingStatus === 'READY') return;
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
      await this.onFinalFailure({ contentItemId: item.id });
    }
  }

  async onFinalFailure({ contentItemId }: JobData['media.video-poster']): Promise<void> {
    await this.store.markFailed(contentItemId);
    // An original not sanitised by now never will be (the backfill stops here).
    await this.sanitizer.giveUpItem(contentItemId, 'VIDEO');
  }
}
