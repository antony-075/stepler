import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { IMAGE_DERIVED_MIME as COVER_DERIVED_MIME, imageKey } from '../../images/image-keys.js';

const coverKey = (
  collectionId: string,
  coverId: string,
  role: 'original' | 'thumbnail' | 'preview',
) => imageKey(collectionId, 'COVER', coverId, role);
import { PrismaService } from '../../database/prisma.service.js';
import type { CollectionCover } from '../../generated/prisma/client.js';
import type { JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import type { JobHandler } from '../job-handler.js';
import { decodeHeic, needsHeifDecoder } from '../media/decode.js';
import { type Derivatives, renderDerivatives } from '../media/images.js';
import { MediaSlots } from '../media/media-slots.js';
import { PermanentMediaError } from '../media/media-error.js';
import { withWorkDir } from '../media/work-dir.js';

type CoverSource = Pick<CollectionCover, 'id' | 'collectionId' | 'mimeType'>;

/**
 * Makes a cover's thumbnail (480 px) and preview (1600 px) from its copied original, the photo
 * way [A4]: WebP without metadata, HEIC through the libheif CLI, the original streamed to a temp
 * file. The two objects are written first; then one conditional update records them (`READY`,
 * dimensions, derived bytes) only while the row still exists. A cover replaced or removed
 * meanwhile has no row any more: the objects just written are deleted (its `cover.purge` may
 * already have run). A file that cannot be decoded marks the cover `FAILED` at once; other errors
 * are retried, and the last failed attempt marks it `FAILED`. Rerunning overwrites the same keys.
 */
@Injectable()
export class CoverDerivativesHandler implements JobHandler<'media.cover-derivatives'> {
  readonly name = 'media.cover-derivatives';
  private readonly logger = new Logger(CoverDerivativesHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly slots: MediaSlots,
  ) {}

  async handle({ collectionId, coverId }: JobData['media.cover-derivatives']): Promise<void> {
    // Ids as stored (lowercase) for the keys: storage keys are case-sensitive.
    const cover = await this.prisma.collectionCover.findFirst({
      where: { id: coverId, collectionId },
      select: { id: true, collectionId: true, mimeType: true },
    });
    if (cover === null) return;
    try {
      // One media job at a time in the whole worker (memory), whatever its type.
      await this.slots.run(() =>
        withWorkDir(async (dir) => {
          const input = join(dir, 'original');
          const original = coverKey(cover.collectionId, cover.id, 'original');
          if (!(await this.storage.downloadToFile(original, input))) {
            throw new PermanentMediaError('cover original is missing from storage');
          }
          const heic = needsHeifDecoder(cover.mimeType);
          const decoded = heic ? await decodeHeic(input, dir) : input;
          // A decoded HEIC is already upright (libheif); everything else follows its EXIF tag.
          const result = await renderDerivatives(decoded, { autoOrient: !heic });
          await this.save(cover, result);
        }),
      );
    } catch (error) {
      if (!(error instanceof PermanentMediaError)) throw error;
      this.logger.warn({ msg: 'cover cannot be processed', coverId, reason: error.message });
      await this.markFailed(cover.id);
    }
  }

  async onFinalFailure({ coverId }: JobData['media.cover-derivatives']): Promise<void> {
    await this.markFailed(coverId);
  }

  private async save(cover: CoverSource, result: Derivatives): Promise<void> {
    const thumbnail = coverKey(cover.collectionId, cover.id, 'thumbnail');
    const preview = coverKey(cover.collectionId, cover.id, 'preview');
    await this.storage.putObject(
      thumbnail,
      result.thumbnail.data,
      COVER_DERIVED_MIME,
      result.thumbnail.data.length,
    );
    await this.storage.putObject(
      preview,
      result.large.data,
      COVER_DERIVED_MIME,
      result.large.data.length,
    );
    const { count } = await this.prisma.collectionCover.updateMany({
      where: { id: cover.id },
      data: {
        status: 'READY',
        width: result.source.width,
        height: result.source.height,
        derivedSizeBytes: BigInt(result.thumbnail.data.length + result.large.data.length),
      },
    });
    if (count === 0) {
      // Replaced or removed while it was processed: nothing records these objects.
      await this.storage.deleteMany([thumbnail, preview]);
    }
  }

  /** Only a `PENDING` cover changes: a rerun that already succeeded stays `READY`. */
  private async markFailed(coverId: string): Promise<void> {
    await this.prisma.collectionCover.updateMany({
      where: { id: coverId, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  }
}
