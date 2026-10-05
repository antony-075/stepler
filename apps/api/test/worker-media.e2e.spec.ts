import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Readable } from 'node:stream';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import type { ContentKind } from '../src/generated/prisma/client.js';
import type { JobData, JobName } from '../src/jobs/job-names.js';
import type { PgBossClient } from '../src/jobs/pg-boss-queue.js';
import type { ObjectStorage } from '../src/storage/object-storage.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';
import { imageKey } from '../src/images/image-keys.js';
import {
  CollectionImageDerivativesHandler,
  LegacyCoverDerivativesHandler,
} from '../src/worker/handlers/collection-image-derivatives.handler.js';
import { ImageDerivativesHandler } from '../src/worker/handlers/image-derivatives.handler.js';
import { VideoPosterHandler } from '../src/worker/handlers/video-poster.handler.js';
import type { JobHandler } from '../src/worker/job-handler.js';
import { JobRunner } from '../src/worker/job-runner.js';
import { DerivativeStore, derivedKey } from '../src/worker/media/derivative-store.js';
import { MediaSlots } from '../src/worker/media/media-slots.js';
import { loadWorkerEnv } from '../src/worker/worker-env.js';
import { resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv } from './support/env.js';
import { allKeys } from './support/storage.js';
import { fixture } from './support/uploads.js';

const coverKey = (collectionId: string, id: string, role: 'original' | 'thumbnail' | 'preview') =>
  imageKey(collectionId, 'COVER', id, role);

const apiEnv = testEnv();
const env = loadWorkerEnv({
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  DATABASE_URL: TEST_DATABASE_URL,
  S3_ENDPOINT: apiEnv.S3_ENDPOINT,
  S3_REGION: apiEnv.S3_REGION,
  S3_BUCKET: apiEnv.S3_BUCKET,
  S3_ACCESS_KEY_ID: apiEnv.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: apiEnv.S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: 'true',
});
const prisma = new PrismaService(env);
const storage = new S3ObjectStorage(env);
const store = new DerivativeStore(prisma, storage);
const slots = new MediaSlots({ WORKER_MEDIA_CONCURRENCY: 1 });

let sequence = 0;

/** A pending PHOTO/VIDEO item whose original (`bytes`) is in storage under an upload-style key. */
async function addMedia(
  kind: ContentKind,
  bytes: Buffer,
  mimeType: string,
  storedType: string = mimeType,
) {
  const owner = await prisma.user.create({ data: { email: `owner${++sequence}@example.com` } });
  const collection = await prisma.collection.create({
    data: { ownerId: owner.id, title: 'Весілля', description: 'Опис' },
  });
  const item = await prisma.contentItem.create({
    data: { collectionId: collection.id, frameNo: 1, kind, processingStatus: 'PENDING' },
  });
  const storageKey = `collections/${collection.id}/uploads/${item.id}/original`;
  await storage.putObject(storageKey, bytes, storedType, bytes.length);
  await prisma.mediaObject.create({
    data: {
      contentItemId: item.id,
      role: 'ORIGINAL',
      storageKey,
      mimeType,
      sizeBytes: BigInt(bytes.length),
    },
  });
  return { collectionId: collection.id, itemId: item.id, storageKey };
}

const mediaRows = (contentItemId: string) =>
  prisma.mediaObject.findMany({ where: { contentItemId }, orderBy: { role: 'asc' } });
const statusOf = async (id: string) =>
  (await prisma.contentItem.findUniqueOrThrow({ where: { id } })).processingStatus;

async function objectBytes(key: string): Promise<Buffer> {
  const url = await storage.presignGet(key, { expiresInSeconds: 60 });
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}

afterAll(async () => {
  storage.onModuleDestroy();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDatabase(prisma);
});

describe('media.image-derivatives', () => {
  const handler = (s: ObjectStorage = storage) => new ImageDerivativesHandler(store, s, slots);

  test('a JPEG gets a 480 px thumbnail and a 1600 px preview; a rerun changes nothing', async () => {
    const jpeg = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: '#a0522d' },
    })
      .jpeg()
      .withExif({ IFD0: { Make: 'Stepler Test Camera' } })
      .toBuffer();
    const { collectionId, itemId, storageKey } = await addMedia('PHOTO', jpeg, 'image/jpeg');

    await handler().handle({ contentItemId: itemId });

    expect(await statusOf(itemId)).toBe('READY');
    const rows = await mediaRows(itemId);
    expect(rows.map((row) => row.role)).toEqual(['ORIGINAL', 'THUMBNAIL', 'PREVIEW']);
    expect(rows[0]).toMatchObject({ width: 2400, height: 1800, storageKey });
    expect(rows[1]).toMatchObject({
      storageKey: derivedKey(collectionId, itemId, 'THUMBNAIL'),
      mimeType: 'image/webp',
      width: 480,
      height: 360,
    });
    expect(rows[2]).toMatchObject({ width: 1600, height: 1200 });
    const thumbnail = await objectBytes(rows[1]?.storageKey ?? '');
    expect(BigInt(thumbnail.length)).toBe(rows[1]?.sizeBytes);
    const meta = await sharp(thumbnail).metadata();
    expect([meta.format, Math.max(meta.width, meta.height), meta.exif]).toEqual([
      'webp',
      480,
      undefined,
    ]);

    // Retried (for example after a crash before the job was marked done): same keys and rows.
    await handler().handle({ contentItemId: itemId });
    expect((await mediaRows(itemId)).map((row) => row.storageKey)).toEqual(
      rows.map((row) => row.storageKey),
    );
    expect(await allKeys(storage, `collections/${collectionId}/derived/`)).toHaveLength(2);
    // The original is untouched.
    expect((await storage.head(storageKey))?.size).toBe(jpeg.length);
  });

  test('a HEIC photo gets a preview through the libheif CLI', async () => {
    const { itemId } = await addMedia('PHOTO', fixture('photo.heic'), 'image/heic');
    await handler().handle({ contentItemId: itemId });
    expect(await statusOf(itemId)).toBe('READY');
    const preview = (await mediaRows(itemId)).find((row) => row.role === 'PREVIEW');
    expect(preview).toMatchObject({ width: 320, height: 240 });
    const meta = await sharp(await objectBytes(preview?.storageKey ?? '')).metadata();
    expect([meta.width, meta.height]).toEqual([320, 240]);
  });

  test('derivative bytes count in storage usage (MediaObject rows)', async () => {
    const { itemId } = await addMedia('PHOTO', fixture('photo.png'), 'image/png');
    await handler().handle({ contentItemId: itemId });
    const sizes = (await mediaRows(itemId)).map((row) => row.sizeBytes);
    expect(sizes).toHaveLength(3);
    expect(sizes.every((size) => size > 0n)).toBe(true);
  });

  test('a tiny HEIC that declares 121 MP is FAILED at once, without retries', async () => {
    const { itemId } = await addMedia('PHOTO', fixture('huge.heic'), 'image/heic');
    const startedAt = Date.now();
    await handler().handle({ contentItemId: itemId });
    expect(await statusOf(itemId)).toBe('FAILED');
    expect(Date.now() - startedAt).toBeLessThan(20_000);
  });

  test('a corrupt photo is FAILED at once; the original stays', async () => {
    const broken = Buffer.concat([fixture('photo.jpg').subarray(0, 20), Buffer.alloc(500, 7)]);
    const { itemId, storageKey } = await addMedia('PHOTO', broken, 'image/jpeg');
    await handler().handle({ contentItemId: itemId });
    expect(await statusOf(itemId)).toBe('FAILED');
    expect((await mediaRows(itemId)).map((row) => row.role)).toEqual(['ORIGINAL']);
    expect(await storage.head(storageKey)).not.toBeNull();
  });

  test('an item deleted while it was processed records nothing and leaves no objects', async () => {
    const { collectionId, itemId } = await addMedia('PHOTO', fixture('photo.jpg'), 'image/jpeg');
    let deleted = false;
    const deletingStorage = Object.assign(Object.create(storage) as ObjectStorage, {
      putObject: async (key: string, body: Buffer | Readable, type: string, length?: number) => {
        if (!deleted) {
          deleted = true;
          await prisma.contentItem.update({
            where: { id: itemId },
            data: { deletedAt: new Date() },
          });
        }
        await storage.putObject(key, body, type, length);
      },
    });
    await new ImageDerivativesHandler(
      new DerivativeStore(prisma, deletingStorage),
      storage,
      slots,
    ).handle({
      contentItemId: itemId,
    });
    expect((await mediaRows(itemId)).map((row) => row.role)).toEqual(['ORIGINAL']);
    expect(await statusOf(itemId)).toBe('PENDING');
    expect(await allKeys(storage, `collections/${collectionId}/derived/`)).toEqual([]);
  });

  test('a missing or deleted item is a no-op', async () => {
    await handler().handle({ contentItemId: '019a0000-0000-7000-8000-000000000000' });
    const { itemId } = await addMedia('PHOTO', fixture('photo.jpg'), 'image/jpeg');
    await prisma.contentItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
    await handler().handle({ contentItemId: itemId });
    expect((await mediaRows(itemId)).map((row) => row.role)).toEqual(['ORIGINAL']);
  });
});

describe('media.collection-image (covers)', () => {
  const images = (s: ObjectStorage = storage) =>
    new CollectionImageDerivativesHandler(prisma, s, slots);
  /** The image handler, called the way slice 8a queued cover jobs (`coverId`). */
  const handler = (s: ObjectStorage = storage) => {
    const inner = images(s);
    return {
      handle: ({ collectionId, coverId }: { collectionId: string; coverId: string }) =>
        inner.handle({ collectionId, imageId: coverId }),
      onFinalFailure: ({ collectionId, coverId }: { collectionId: string; coverId: string }) =>
        inner.onFinalFailure({ collectionId, imageId: coverId }),
    };
  };

  /** A pending cover whose copied original (`bytes`) is at its own key. */
  async function addCover(bytes: Buffer, mimeType: string) {
    const owner = await prisma.user.create({ data: { email: `owner${++sequence}@example.com` } });
    const collection = await prisma.collection.create({
      data: { ownerId: owner.id, title: 'Весілля' },
    });
    const cover = await prisma.collectionImage.create({
      data: {
        collectionId: collection.id,
        slot: 'COVER',
        source: 'UPLOAD',
        mimeType,
        originalSizeBytes: BigInt(bytes.length),
      },
    });
    const original = coverKey(collection.id, cover.id, 'original');
    await storage.putObject(original, bytes, mimeType, bytes.length);
    return { collectionId: collection.id, coverId: cover.id, original };
  }
  const coverRow = (id: string) => prisma.collectionImage.findUnique({ where: { id } });
  const coverKeys = (collectionId: string) =>
    allKeys(storage, `collections/${collectionId}/cover/`);

  test('a JPEG cover gets a 480 px thumbnail and a 1600 px preview and is READY; a rerun changes nothing', async () => {
    const jpeg = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: '#a0522d' },
    })
      .jpeg()
      .withExif({ IFD0: { Make: 'Stepler Test Camera' } })
      .toBuffer();
    const { collectionId, coverId, original } = await addCover(jpeg, 'image/jpeg');

    await handler().handle({ collectionId, coverId });

    const row = await coverRow(coverId);
    expect(row).toMatchObject({ status: 'READY', width: 2400, height: 1800 });
    const thumbnail = await objectBytes(coverKey(collectionId, coverId, 'thumbnail'));
    const preview = await objectBytes(coverKey(collectionId, coverId, 'preview'));
    expect(row?.derivedSizeBytes).toBe(BigInt(thumbnail.length + preview.length));
    const thumbMeta = await sharp(thumbnail).metadata();
    expect([thumbMeta.format, Math.max(thumbMeta.width, thumbMeta.height), thumbMeta.exif]).toEqual(
      ['webp', 480, undefined],
    );
    const previewMeta = await sharp(preview).metadata();
    expect([previewMeta.format, previewMeta.width, previewMeta.height]).toEqual([
      'webp',
      1600,
      1200,
    ]);
    expect((await storage.head(original))?.size).toBe(jpeg.length);

    await handler().handle({ collectionId, coverId });
    expect(await coverKeys(collectionId)).toEqual(
      [
        original,
        coverKey(collectionId, coverId, 'preview'),
        coverKey(collectionId, coverId, 'thumbnail'),
      ].sort(),
    );
    expect(await prisma.collectionImage.count({ where: { collectionId } })).toBe(1);
    expect((await coverRow(coverId))?.status).toBe('READY');
  });

  test('a HEIC cover goes through the libheif CLI', async () => {
    const { collectionId, coverId } = await addCover(fixture('photo.heic'), 'image/heic');
    await handler().handle({ collectionId, coverId });
    expect(await coverRow(coverId)).toMatchObject({ status: 'READY', width: 320, height: 240 });
    const meta = await sharp(
      await objectBytes(coverKey(collectionId, coverId, 'preview')),
    ).metadata();
    expect([meta.width, meta.height]).toEqual([320, 240]);
  });

  test('Review Focus 2: a cover replaced while it was processed records nothing and leaves no objects', async () => {
    const { collectionId, coverId, original } = await addCover(fixture('photo.jpg'), 'image/jpeg');
    let replaced = false;
    const replacingStorage = Object.assign(Object.create(storage) as ObjectStorage, {
      putObject: async (key: string, body: Buffer | Readable, type: string, length?: number) => {
        if (!replaced) {
          replaced = true;
          // The API's replace: the row goes at once; its purge may run any time after.
          await prisma.collectionImage.delete({ where: { id: coverId } });
        }
        await storage.putObject(key, body, type, length);
      },
    });
    await handler(replacingStorage).handle({ collectionId, coverId });
    expect(await coverRow(coverId)).toBeNull();
    // Only the original is left, for `cover.purge` to remove.
    expect(await coverKeys(collectionId)).toEqual([original]);
  });

  test('a corrupt original is FAILED at once; the original stays', async () => {
    const broken = Buffer.concat([fixture('photo.jpg').subarray(0, 20), Buffer.alloc(500, 7)]);
    const { collectionId, coverId, original } = await addCover(broken, 'image/jpeg');
    await handler().handle({ collectionId, coverId });
    expect((await coverRow(coverId))?.status).toBe('FAILED');
    expect(await coverKeys(collectionId)).toEqual([original]);
  });

  test('a missing row, or a row of another collection, is a no-op', async () => {
    const { collectionId, coverId } = await addCover(fixture('photo.jpg'), 'image/jpeg');
    await handler().handle({ collectionId: '019a0000-0000-7000-8000-000000000000', coverId });
    await handler().handle({ collectionId, coverId: '019a0000-0000-7000-8000-000000000000' });
    expect((await coverRow(coverId))?.status).toBe('PENDING');
  });

  test('after its retries a cover job leaves the cover FAILED', async () => {
    const { collectionId, coverId } = await addCover(fixture('photo.jpg'), 'image/jpeg');
    const down = Object.assign(Object.create(storage) as ObjectStorage, {
      downloadToFile: () => Promise.reject(new Error('storage unavailable')),
    });
    const h = handler(down);
    await expect(h.handle({ collectionId, coverId })).rejects.toThrow('storage unavailable');
    expect((await coverRow(coverId))?.status).toBe('PENDING');
    await h.onFinalFailure({ collectionId, coverId });
    expect((await coverRow(coverId))?.status).toBe('FAILED');
  });
});

describe('media.video-poster', () => {
  const handler = (s: ObjectStorage = storage) => new VideoPosterHandler(store, s, slots);

  test.each([
    ['clip.mp4', 'video/mp4'],
    ['clip.mov', 'video/quicktime'],
    ['clip.webm', 'video/webm'],
  ])('%s gets a poster, a thumbnail, its duration and size', async (name, mime) => {
    const { collectionId, itemId } = await addMedia('VIDEO', fixture(name), mime);
    await handler().handle({ contentItemId: itemId });

    expect(await statusOf(itemId)).toBe('READY');
    const rows = await mediaRows(itemId);
    expect(rows.map((row) => row.role)).toEqual(['ORIGINAL', 'THUMBNAIL', 'POSTER']);
    const [original, thumbnail, poster] = rows;
    if (name !== 'clip.webm') {
      expect(original?.durationMs).toBeGreaterThanOrEqual(900);
      expect(original?.durationMs).toBeLessThanOrEqual(1100);
    }
    const size = name === 'clip.webm' ? [160, 120] : [320, 240];
    expect([original?.width, original?.height]).toEqual(size);
    expect([poster?.width, poster?.height]).toEqual(size);
    expect(thumbnail?.storageKey).toBe(derivedKey(collectionId, itemId, 'THUMBNAIL'));
    expect(poster?.storageKey).toBe(derivedKey(collectionId, itemId, 'POSTER'));
    const meta = await sharp(await objectBytes(poster?.storageKey ?? '')).metadata();
    expect([meta.format, meta.width]).toEqual(['webp', size[0]]);
  });

  test('a tiny MP4 with 49 MP frames is FAILED at once, before any frame is decoded', async () => {
    const { itemId } = await addMedia('VIDEO', fixture('huge.mp4'), 'video/mp4');
    const startedAt = Date.now();
    await handler().handle({ contentItemId: itemId });
    expect(await statusOf(itemId)).toBe('FAILED');
    expect(Date.now() - startedAt).toBeLessThan(20_000);
  });

  test('a truncated MP4 is FAILED at once; the original stays', async () => {
    const truncated = fixture('clip.mp4').subarray(0, 2000);
    const { itemId, storageKey } = await addMedia('VIDEO', truncated, 'video/mp4');
    await handler().handle({ contentItemId: itemId });
    expect(await statusOf(itemId)).toBe('FAILED');
    expect(await storage.head(storageKey)).not.toBeNull();
  });

  test('a playlist uploaded as a video never makes ffmpeg fetch the URLs it names', async () => {
    let hits = 0;
    const target: Server = createServer((_req, res) => {
      hits += 1;
      res.end(fixture('clip.mp4'));
    });
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
    const { port } = target.address() as AddressInfo;
    try {
      const playlist = Buffer.from(
        `#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:${port}/internal.mp4\n#EXT-X-ENDLIST\n`,
      );
      // Stored as HLS: recent ffmpeg probes a playlist only by its type or extension.
      const { itemId } = await addMedia(
        'VIDEO',
        playlist,
        'video/mp4',
        'application/vnd.apple.mpegurl',
      );
      await handler().handle({ contentItemId: itemId });
      expect(await statusOf(itemId)).toBe('FAILED');
      expect(hits).toBe(0);
    } finally {
      await new Promise((resolve) => target.close(resolve));
    }
  });

  test('a storage error is retried, and its message carries no presigned URL', async () => {
    const { itemId } = await addMedia('VIDEO', fixture('clip.mp4'), 'video/mp4');
    const missing = Object.assign(Object.create(storage) as ObjectStorage, {
      presignGet: () =>
        storage.presignGet(`collections/${itemId}/missing`, { expiresInSeconds: 60 }),
    });
    const error = await handler(missing)
      .handle({ contentItemId: itemId })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).not.toMatch(/X-Amz-Signature|X-Amz-Credential|127\.0\.0\.1/);
    expect(await statusOf(itemId)).toBe('PENDING');
  });
});

describe('JobRunner', () => {
  /** A runner around one handler; the pg-boss client is never started here. */
  function runnerWith(handler: JobHandler) {
    const noop = (name: JobName) => ({ name, handle: () => Promise.resolve() });
    return new JobRunner(
      {} as PgBossClient,
      { WORKER_MEDIA_CONCURRENCY: 1 },
      noop('content.purge') as never,
      noop('collection.purge') as never,
      noop('maintenance.sweep') as never,
      noop('storage.discard-upload') as never,
      noop('uploads.expire') as never,
      handler as never,
      noop('media.video-poster') as never,
      noop('media.collection-image') as never,
      noop('collection-image.purge') as never,
      noop('media.cover-derivatives') as never,
      noop('cover.purge') as never,
    );
  }
  const job = (retryCount: number) =>
    ({
      id: 'job-1',
      name: 'media.image-derivatives',
      data: { contentItemId: 'item-1' },
      retryCount,
    }) as never;

  test('only the last failed attempt runs onFinalFailure, and the error still propagates', async () => {
    const finals: JobData['media.image-derivatives'][] = [];
    const handler: JobHandler<'media.image-derivatives'> = {
      name: 'media.image-derivatives',
      handle: () => Promise.reject(new Error('storage unavailable')),
      onFinalFailure: (data) => {
        finals.push(data);
        return Promise.resolve();
      },
    };
    const runner = runnerWith(handler);
    await expect(runner.run(handler as JobHandler, job(4))).rejects.toThrow('storage unavailable');
    expect(finals).toEqual([]);
    await expect(runner.run(handler as JobHandler, job(5))).rejects.toThrow('storage unavailable');
    expect(finals).toEqual([{ contentItemId: 'item-1' }]);
  });

  test('after its retries a photo job leaves the item FAILED', async () => {
    const { itemId } = await addMedia('PHOTO', fixture('photo.jpg'), 'image/jpeg');
    const down = Object.assign(Object.create(storage) as ObjectStorage, {
      downloadToFile: () => Promise.reject(new Error('storage unavailable')),
    });
    const handler = new ImageDerivativesHandler(store, down, slots) as JobHandler;
    const runner = runnerWith(handler);
    const attempt = (retryCount: number) =>
      runner.run(handler, {
        id: 'job-2',
        name: 'media.image-derivatives',
        data: { contentItemId: itemId },
        retryCount,
      } as never);
    await expect(attempt(0)).rejects.toThrow();
    expect(await statusOf(itemId)).toBe('PENDING');
    await expect(attempt(5)).rejects.toThrow();
    expect(await statusOf(itemId)).toBe('FAILED');
  });
});

describe('media.collection-image: renditions per slot (plan Task 8)', () => {
  const handler = () => new CollectionImageDerivativesHandler(prisma, storage, slots);

  async function addImage(slot: 'BACKGROUND' | 'COLLECTION_IMAGE' | 'COVER', bytes: Buffer) {
    const owner = await prisma.user.create({ data: { email: `owner${++sequence}@example.com` } });
    const collection = await prisma.collection.create({
      data: { ownerId: owner.id, title: 'Весілля' },
    });
    const image = await prisma.collectionImage.create({
      data: {
        collectionId: collection.id,
        slot,
        source: 'UPLOAD',
        mimeType: 'image/jpeg',
        originalSizeBytes: BigInt(bytes.length),
      },
    });
    const original = imageKey(collection.id, slot, image.id, 'original');
    await storage.putObject(original, bytes, 'image/jpeg', bytes.length);
    return { collectionId: collection.id, imageId: image.id, original };
  }

  const longest = async (key: string) => {
    const meta = await sharp(await objectBytes(key)).metadata();
    return { format: meta.format, longest: Math.max(meta.width, meta.height) };
  };

  test('a BACKGROUND gets three WebP renditions (480, 1600, 2400); derivedSizeBytes is their sum', async () => {
    const jpeg = await sharp({
      create: { width: 3200, height: 2000, channels: 3, background: '#2c7350' },
    })
      .jpeg()
      .toBuffer();
    const { collectionId, imageId, original } = await addImage('BACKGROUND', jpeg);
    await handler().handle({ collectionId, imageId });
    const key = (role: 'thumbnail' | 'preview' | 'large') =>
      imageKey(collectionId, 'BACKGROUND', imageId, role);
    expect(await longest(key('thumbnail'))).toEqual({ format: 'webp', longest: 480 });
    expect(await longest(key('preview'))).toEqual({ format: 'webp', longest: 1600 });
    expect(await longest(key('large'))).toEqual({ format: 'webp', longest: 2400 });
    const sizes = await Promise.all(
      (['thumbnail', 'preview', 'large'] as const).map(
        async (role) => (await objectBytes(key(role))).length,
      ),
    );
    const row = await prisma.collectionImage.findUniqueOrThrow({ where: { id: imageId } });
    expect(row).toMatchObject({ status: 'READY', width: 3200, height: 2000 });
    expect(row.derivedSizeBytes).toBe(BigInt(sizes.reduce((a, b) => a + b, 0)));
    expect(await allKeys(storage, `collections/${collectionId}/background/`)).toEqual(
      [original, key('large'), key('preview'), key('thumbnail')].sort(),
    );
  });

  test('a small BACKGROUND is never enlarged', async () => {
    const { collectionId, imageId } = await addImage('BACKGROUND', fixture('photo.jpg'));
    await handler().handle({ collectionId, imageId });
    const row = await prisma.collectionImage.findUniqueOrThrow({ where: { id: imageId } });
    const large = await longest(imageKey(collectionId, 'BACKGROUND', imageId, 'large'));
    expect(large.longest).toBe(Math.max(row.width ?? 0, row.height ?? 0));
  });

  test('a COLLECTION_IMAGE gets the thumbnail only', async () => {
    const { collectionId, imageId, original } = await addImage(
      'COLLECTION_IMAGE',
      fixture('photo.jpg'),
    );
    await handler().handle({ collectionId, imageId });
    expect(await allKeys(storage, `collections/${collectionId}/collection-image/`)).toEqual(
      [original, imageKey(collectionId, 'COLLECTION_IMAGE', imageId, 'thumbnail')].sort(),
    );
    expect(
      (await prisma.collectionImage.findUniqueOrThrow({ where: { id: imageId } })).status,
    ).toBe('READY');
  });

  test('a legacy media.cover-derivatives job ({ coverId }) still completes a COVER image', async () => {
    const { collectionId, imageId } = await addImage('COVER', fixture('photo.jpg'));
    const legacy = new LegacyCoverDerivativesHandler(handler());
    expect(legacy.name).toBe('media.cover-derivatives');
    await legacy.handle({ collectionId, coverId: imageId });
    expect(
      (await prisma.collectionImage.findUniqueOrThrow({ where: { id: imageId } })).status,
    ).toBe('READY');
    expect(await allKeys(storage, `collections/${collectionId}/cover/${imageId}/`)).toHaveLength(3);
  });
});
