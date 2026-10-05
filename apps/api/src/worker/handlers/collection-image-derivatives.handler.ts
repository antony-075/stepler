import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { CollectionImage } from '../../generated/prisma/client.js';
import { IMAGE_DERIVED_MIME, imageKey, RENDITIONS } from '../../images/image-keys.js';
import type { JobData } from '../../jobs/job-names.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import type { JobHandler } from '../job-handler.js';
import { decodeHeic, needsHeifDecoder } from '../media/decode.js';
import { renderRenditions } from '../media/images.js';
import { MediaSlots } from '../media/media-slots.js';
import { PermanentMediaError } from '../media/media-error.js';
import { withWorkDir } from '../media/work-dir.js';

type ImageSource = Pick<CollectionImage, 'id' | 'collectionId' | 'slot' | 'mimeType'>;

/**
 * Makes an admin image's renditions for its slot from its copied original (plan Task 8): a cover
 * 480 + 1600 px, a background 480 + 1600 + 2400 px, the collection image 480 px; WebP without
 * metadata, HEIC through the libheif CLI, the original streamed to a temp file. The objects are
 * written first; then one update records them (`READY`, dimensions, derived bytes) only while the
 * row still exists. An image dropped meanwhile has no row any more: the objects just written are
 * deleted (its `collection-image.purge` may already have run). A file that cannot be decoded
 * marks it `FAILED` at once; other errors are retried, and the last failed attempt marks it
 * `FAILED`. Rerunning overwrites the same keys.
 */
@Injectable()
export class CollectionImageDerivativesHandler implements JobHandler<'media.collection-image'> {
  readonly name = 'media.collection-image';
  private readonly logger = new Logger(CollectionImageDerivativesHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly slots: MediaSlots,
  ) {}

  async handle({ collectionId, imageId }: JobData['media.collection-image']): Promise<void> {
    // Ids as stored (lowercase) for the keys: storage keys are case-sensitive.
    const image = await this.prisma.collectionImage.findFirst({
      where: { id: imageId, collectionId },
      select: { id: true, collectionId: true, slot: true, mimeType: true },
    });
    if (image === null) return;
    try {
      // One media job at a time in the whole worker (memory), whatever its type.
      await this.slots.run(() =>
        withWorkDir(async (dir) => {
          const input = join(dir, 'original');
          const original = imageKey(image.collectionId, image.slot, image.id, 'original');
          if (!(await this.storage.downloadToFile(original, input))) {
            throw new PermanentMediaError('image original is missing from storage');
          }
          const heic = needsHeifDecoder(image.mimeType);
          const decoded = heic ? await decodeHeic(input, dir) : input;
          // A decoded HEIC is already upright (libheif); everything else follows its EXIF tag.
          const result = await renderRenditions(decoded, RENDITIONS[image.slot], {
            autoOrient: !heic,
          });
          await this.save(image, result);
        }),
      );
    } catch (error) {
      if (!(error instanceof PermanentMediaError)) throw error;
      this.logger.warn({ msg: 'image cannot be processed', imageId, reason: error.message });
      await this.markFailed(image.id);
    }
  }

  async onFinalFailure({ imageId }: JobData['media.collection-image']): Promise<void> {
    await this.markFailed(imageId);
  }

  private async save(
    image: ImageSource,
    result: Awaited<ReturnType<typeof renderRenditions>>,
  ): Promise<void> {
    const written: string[] = [];
    let bytes = 0;
    for (const role of RENDITIONS[image.slot]) {
      const rendition = result.renditions[role];
      const key = imageKey(image.collectionId, image.slot, image.id, role);
      await this.storage.putObject(key, rendition.data, IMAGE_DERIVED_MIME, rendition.data.length);
      written.push(key);
      bytes += rendition.data.length;
    }
    const { count } = await this.prisma.collectionImage.updateMany({
      where: { id: image.id },
      data: {
        status: 'READY',
        width: result.source.width,
        height: result.source.height,
        derivedSizeBytes: BigInt(bytes),
      },
    });
    if (count === 0) {
      // Dropped while it was processed: nothing records these objects.
      await this.storage.deleteMany(written);
    }
  }

  /** Only a `PENDING` image changes: a rerun that already succeeded stays `READY`. */
  private async markFailed(imageId: string): Promise<void> {
    await this.prisma.collectionImage.updateMany({
      where: { id: imageId, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  }
}

/**
 * Legacy queue (slice 8a, until PR L): `media.cover-derivatives` jobs queued before the upgrade
 * still run. Covers kept their ids as COVER images, so `coverId` is the image's.
 */
@Injectable()
export class LegacyCoverDerivativesHandler implements JobHandler<'media.cover-derivatives'> {
  readonly name = 'media.cover-derivatives';

  constructor(private readonly images: CollectionImageDerivativesHandler) {}

  handle({ collectionId, coverId, ...meta }: JobData['media.cover-derivatives']): Promise<void> {
    return this.images.handle({ collectionId, imageId: coverId, ...meta });
  }

  onFinalFailure({ collectionId, coverId }: JobData['media.cover-derivatives']): Promise<void> {
    return this.images.onFinalFailure({ collectionId, imageId: coverId });
  }
}
