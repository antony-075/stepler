import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { ContentKind, MediaRole, ProcessingStatus } from '../../generated/prisma/client.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import { derivedPrefix } from '../storage-purge.js';
import type { Rendition } from './images.js';

export const DERIVED_MIME = 'image/webp';

type DerivedRole = Exclude<MediaRole, 'ORIGINAL'>;

/**
 * Derived keys are built from ids only (spec §10.6, no user data), under the item's derived
 * prefix, which the content and collection purges delete as a whole.
 */
export const derivedKey = (collectionId: string, contentItemId: string, role: DerivedRole) =>
  `${derivedPrefix(collectionId, contentItemId)}${role.toLowerCase()}.webp`;

/** An item a media job works on, with its original. */
export interface MediaSource {
  id: string;
  collectionId: string;
  storageKey: string;
  mimeType: string;
  /** `READY` when the job only sanitises a legacy original (backfill): its previews exist. */
  processingStatus: ProcessingStatus;
  sanitizedAt: Date | null;
}

export interface OriginalFacts {
  width: number;
  height: number;
  durationMs?: number | null;
}

/**
 * Loads media-job inputs and records their results. The derived objects are written first, then
 * one transaction records them (`READY`) only while the item is not deleted; if it was deleted
 * meanwhile the objects just written are removed (the purge may already have run). Rerunning
 * overwrites the same keys and rows (idempotent).
 */
@Injectable()
export class DerivativeStore {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** The item and its original; `null` when it is gone, deleted, of another kind or has none. */
  async source(contentItemId: string, kind: ContentKind): Promise<MediaSource | null> {
    const item = await this.prisma.contentItem.findFirst({
      where: { id: contentItemId, kind, deletedAt: null },
      select: {
        id: true,
        collectionId: true,
        processingStatus: true,
        sanitizedAt: true,
        mediaObjects: { where: { role: 'ORIGINAL' }, select: { storageKey: true, mimeType: true } },
      },
    });
    const original = item?.mediaObjects[0];
    if (item === null || original === undefined) return null;
    return {
      id: item.id,
      collectionId: item.collectionId,
      processingStatus: item.processingStatus,
      sanitizedAt: item.sanitizedAt,
      ...original,
    };
  }

  /** Returns `false` when the item was deleted meanwhile (nothing recorded, objects removed). */
  async save(
    item: MediaSource,
    renditions: Partial<Record<DerivedRole, Rendition>>,
    original: OriginalFacts,
  ): Promise<boolean> {
    const entries = Object.entries(renditions) as [DerivedRole, Rendition][];
    const keys = entries.map(([role]) => derivedKey(item.collectionId, item.id, role));
    for (const [i, [, rendition]] of entries.entries()) {
      await this.storage.putObject(
        keys[i] ?? '',
        rendition.data,
        DERIVED_MIME,
        rendition.data.length,
      );
    }
    const recorded = await this.prisma.$transaction(async (tx) => {
      // Locks the item row first: a concurrent delete either commits before (nothing is
      // recorded) or waits for this transaction (and its purge then removes these rows).
      const { count } = await tx.contentItem.updateMany({
        where: { id: item.id, deletedAt: null },
        data: { processingStatus: 'READY' },
      });
      if (count === 0) return false;
      for (const [i, [role, rendition]] of entries.entries()) {
        const fields = {
          storageKey: keys[i] ?? '',
          mimeType: DERIVED_MIME,
          sizeBytes: BigInt(rendition.data.length),
          width: rendition.width,
          height: rendition.height,
        };
        await tx.mediaObject.upsert({
          where: { contentItemId_role: { contentItemId: item.id, role } },
          create: { contentItemId: item.id, role, ...fields },
          update: fields,
        });
      }
      await tx.mediaObject.updateMany({
        where: { contentItemId: item.id, role: 'ORIGINAL' },
        data: {
          width: original.width,
          height: original.height,
          ...(original.durationMs === undefined ? {} : { durationMs: original.durationMs }),
        },
      });
      return true;
    });
    if (!recorded) await this.storage.deleteMany(keys);
    return recorded;
  }

  /**
   * The item keeps its original and shows a type tile (D4). Only a `PENDING` item changes: a
   * rerun that already succeeded stays `READY`.
   */
  async markFailed(contentItemId: string): Promise<void> {
    await this.prisma.contentItem.updateMany({
      where: { id: contentItemId, processingStatus: 'PENDING' },
      data: { processingStatus: 'FAILED' },
    });
  }
}
