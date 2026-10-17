import { writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
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
import { CollectionImageDerivativesHandler } from '../src/worker/handlers/collection-image-derivatives.handler.js';
import { ImageDerivativesHandler } from '../src/worker/handlers/image-derivatives.handler.js';
import { VideoPosterHandler } from '../src/worker/handlers/video-poster.handler.js';
import type { JobHandler } from '../src/worker/job-handler.js';
import { JobRunner } from '../src/worker/job-runner.js';
import { DerivativeStore, derivedKey } from '../src/worker/media/derivative-store.js';
import { run } from '../src/worker/media/exec.js';
import { exiftoolLocationTags, ffprobeLocationKeys } from '../src/worker/media/location.js';
import { MediaSlots } from '../src/worker/media/media-slots.js';
import { OriginalSanitizer } from '../src/worker/media/original-sanitizer.js';
import { withWorkDir } from '../src/worker/media/work-dir.js';
import { loadWorkerEnv } from '../src/worker/worker-env.js';
import { resetDatabase } from './support/database.js';
import { TEST_DATABASE_URL, testEnv, WORKER_MAIL_ENV } from './support/env.js';
import { allKeys } from './support/storage.js';
import { fixture } from './support/uploads.js';

const coverKey = (collectionId: string, id: string, role: 'original' | 'thumbnail' | 'preview') =>
  imageKey(collectionId, 'COVER', id, role);

const apiEnv = testEnv();
const env = loadWorkerEnv({
  ...WORKER_MAIL_ENV,
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
const sanitizer = new OriginalSanitizer(prisma, storage);

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
  const handler = (s: ObjectStorage = storage) =>
    new ImageDerivativesHandler(store, s, slots, new OriginalSanitizer(prisma, s));

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
      sanitizer,
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
    new CollectionImageDerivativesHandler(prisma, s, slots, new OriginalSanitizer(prisma, s));
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
    // Only the original is left, for `collection-image.purge` to remove.
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
  const handler = (s: ObjectStorage = storage) =>
    new VideoPosterHandler(store, s, slots, new OriginalSanitizer(prisma, s));

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
      noop('mail.report-received') as never,
      noop('mail.report-decision') as never,
      noop('mail.appeal-received') as never,
      noop('billing.retention') as never,
      noop('mail.billing-read-only') as never,
      noop('mail.billing-deletion-warning') as never,
      noop('billing.reconcile') as never,
      noop('mail.billing-renewal-failed') as never,
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
    const handler = new ImageDerivativesHandler(
      store,
      down,
      slots,
      new OriginalSanitizer(prisma, down),
    ) as JobHandler;
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
  const handler = () => new CollectionImageDerivativesHandler(prisma, storage, slots, sanitizer);

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

  test('a BACKGROUND over the decoded pixel limit (a 42 MP PNG) is FAILED, nothing written', async () => {
    const png = await sharp({
      create: { width: 7000, height: 6000, channels: 3, background: '#110f15' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const { collectionId, imageId, original } = await addImage('BACKGROUND', png);
    await handler().handle({ collectionId, imageId });
    expect(
      (await prisma.collectionImage.findUniqueOrThrow({ where: { id: imageId } })).status,
    ).toBe('FAILED');
    expect(await allKeys(storage, `collections/${collectionId}/background/`)).toEqual([original]);
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
});

describe('location stripping before previews (ADR 0008 addendum 2026-10-05)', () => {
  const photos = (s: ObjectStorage = storage) =>
    new ImageDerivativesHandler(store, s, slots, new OriginalSanitizer(prisma, s));
  const videos = (s: ObjectStorage = storage) =>
    new VideoPosterHandler(store, s, slots, new OriginalSanitizer(prisma, s));
  const itemOf = (id: string) => prisma.contentItem.findUniqueOrThrow({ where: { id } });
  const originalRow = async (id: string) =>
    (await mediaRows(id)).find((row) => row.role === 'ORIGINAL');

  /** The stored object, saved to a temp file for exiftool/ffprobe. */
  const stored = async <T>(key: string, inspect: (path: string) => Promise<T>): Promise<T> =>
    withWorkDir(async (dir) => {
      const path = join(dir, 'stored');
      await writeFile(path, await objectBytes(key));
      return inspect(path);
    });

  test('a photo: the stored original loses its GPS, keeps date and orientation; usage follows', async () => {
    const jpeg = fixture('location.jpg');
    const { itemId, storageKey } = await addMedia('PHOTO', jpeg, 'image/jpeg');

    await photos().handle({ contentItemId: itemId });

    const item = await itemOf(itemId);
    expect(item.processingStatus).toBe('READY');
    expect(item.sanitizedAt).not.toBeNull();
    expect(await stored(storageKey, exiftoolLocationTags)).toEqual({});
    const kept = await stored(storageKey, (path) =>
      run('exiftool', ['-j', '-G1', '-n', '-DateTimeOriginal', '-Orientation', '-Make', path], {
        timeoutMs: 30_000,
      }),
    );
    expect((JSON.parse(kept.toString('utf8')) as Record<string, unknown>[])[0]).toMatchObject({
      'ExifIFD:DateTimeOriginal': '2026:06:14 15:30:00',
      'IFD0:Orientation': 6,
      'IFD0:Make': 'Stepler Test Camera',
    });
    // Usage is the sum of stored sizes: the original's row now holds the sanitised size.
    const size = (await storage.head(storageKey))?.size ?? 0;
    expect(size).toBeLessThan(jpeg.length);
    expect((await originalRow(itemId))?.sizeBytes).toBe(BigInt(size));
    // The previews come from the sanitised original (upright: 240×320).
    expect((await originalRow(itemId))?.width).toBe(240);
  });

  test('a HEIC photo loses its GPS', async () => {
    const { itemId, storageKey } = await addMedia('PHOTO', fixture('location.heic'), 'image/heic');
    await photos().handle({ contentItemId: itemId });
    expect(await statusOf(itemId)).toBe('READY');
    expect(await stored(storageKey, exiftoolLocationTags)).toEqual({});
  });

  test.each([
    ['location.mov', 'video/quicktime'],
    ['location.mp4', 'video/mp4'],
    ['location.webm', 'video/webm'],
  ])('%s: the stored original has no location and the same streams', async (name, mime) => {
    const { itemId, storageKey } = await addMedia('VIDEO', fixture(name), mime);

    await videos().handle({ contentItemId: itemId });

    expect(await statusOf(itemId)).toBe('READY');
    expect((await itemOf(itemId)).sanitizedAt).not.toBeNull();
    expect(await stored(storageKey, ffprobeLocationKeys)).toEqual({ format: [], streams: [] });
    if (mime !== 'video/webm') expect(await stored(storageKey, exiftoolLocationTags)).toEqual({});
    const md5 = (path: string) =>
      run('ffmpeg', ['-v', 'error', '-i', path, '-map', '0', '-c', 'copy', '-f', 'md5', '-'], {
        timeoutMs: 30_000,
      }).then(String);
    expect(await stored(storageKey, md5)).toBe(
      await md5(new URL(`./fixtures/media/${name}`, import.meta.url).pathname),
    );
    expect((await originalRow(itemId))?.sizeBytes).toBe(
      BigInt((await storage.head(storageKey))?.size ?? 0),
    );
    expect((await mediaRows(itemId)).map((row) => row.role)).toContain('POSTER');
  });

  test('retry: a crash after the upload leaves a clean object; the rerun records its size', async () => {
    const { itemId, storageKey } = await addMedia('PHOTO', fixture('location.jpg'), 'image/jpeg');
    const crashing = Object.assign(Object.create(storage) as ObjectStorage, {
      replaceFromFile: async (...args: Parameters<ObjectStorage['replaceFromFile']>) => {
        await storage.replaceFromFile(...args);
        throw new Error('worker killed');
      },
    });
    await expect(photos(crashing).handle({ contentItemId: itemId })).rejects.toThrow(
      'worker killed',
    );
    expect(await itemOf(itemId)).toMatchObject({ processingStatus: 'PENDING', sanitizedAt: null });

    await photos().handle({ contentItemId: itemId });
    const size = BigInt((await storage.head(storageKey))?.size ?? 0);
    expect((await originalRow(itemId))?.sizeBytes).toBe(size);
    const first = await itemOf(itemId);
    expect(first).toMatchObject({ processingStatus: 'READY' });

    // A further rerun (the job retried after it was done) changes nothing.
    await photos().handle({ contentItemId: itemId });
    expect((await itemOf(itemId)).sanitizedAt).toEqual(first.sanitizedAt);
    expect((await originalRow(itemId))?.sizeBytes).toBe(size);
  });

  test('retry: an original that changed since the download is never overwritten', async () => {
    const jpeg = fixture('location.jpg');
    const { itemId, storageKey } = await addMedia('PHOTO', jpeg, 'image/jpeg');
    const stale = Object.assign(Object.create(storage) as ObjectStorage, {
      downloadToFile: async (key: string, path: string) =>
        (await storage.downloadToFile(key, path)) && { etag: '"0123456789abcdef"' },
    });
    await expect(photos(stale).handle({ contentItemId: itemId })).rejects.toThrow(
      'the original changed',
    );
    expect((await storage.head(storageKey))?.size).toBe(jpeg.length);
    expect(await statusOf(itemId)).toBe('PENDING');
  });

  test('an item deleted while it was sanitised keeps no rewritten original', async () => {
    const { itemId, storageKey } = await addMedia('PHOTO', fixture('location.jpg'), 'image/jpeg');
    const deleting = Object.assign(Object.create(storage) as ObjectStorage, {
      replaceFromFile: async (...args: Parameters<ObjectStorage['replaceFromFile']>) => {
        await prisma.contentItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
        return storage.replaceFromFile(...args);
      },
    });
    await photos(deleting).handle({ contentItemId: itemId });
    expect(await storage.head(storageKey)).toBeNull();
    expect((await itemOf(itemId)).sanitizedAt).toBeNull();
    expect((await mediaRows(itemId)).map((row) => row.role)).toEqual(['ORIGINAL']);
  });

  test("a photo that cannot be sanitised still gets its previews; its original stays the admin's", async () => {
    const pending = await addMedia('PHOTO', fixture('photo.jpg'), 'image/bmp');
    await photos().handle({ contentItemId: pending.itemId });
    const item = await itemOf(pending.itemId);
    expect(item).toMatchObject({ processingStatus: 'READY', sanitizedAt: null });
    expect(item.sanitizeFailedAt).not.toBeNull();
    expect((await mediaRows(pending.itemId)).map((row) => row.role)).toEqual([
      'ORIGINAL',
      'THUMBNAIL',
      'PREVIEW',
    ]);

    // A legacy one keeps READY and is not tried again.
    const legacy = await addMedia('PHOTO', fixture('photo.jpg'), 'image/bmp');
    await prisma.contentItem.update({
      where: { id: legacy.itemId },
      data: { processingStatus: 'READY' },
    });
    await photos().handle({ contentItemId: legacy.itemId });
    expect(await itemOf(legacy.itemId)).toMatchObject({ processingStatus: 'READY' });
    expect((await itemOf(legacy.itemId)).sanitizeFailedAt).not.toBeNull();
  });

  test('a video that cannot be sanitised is FAILED', async () => {
    const { itemId } = await addMedia('VIDEO', fixture('clip.mp4'), 'video/x-msvideo');
    await videos().handle({ contentItemId: itemId });
    const item = await itemOf(itemId);
    expect(item.processingStatus).toBe('FAILED');
    expect(item.sanitizeFailedAt).not.toBeNull();
  });

  test('backfill: the last failed retry of a READY item gives up, so the sweep stops', async () => {
    const { itemId } = await addMedia('PHOTO', fixture('location.jpg'), 'image/jpeg');
    await prisma.contentItem.update({ where: { id: itemId }, data: { processingStatus: 'READY' } });
    const down = Object.assign(Object.create(storage) as ObjectStorage, {
      downloadToFile: () => Promise.reject(new Error('storage unavailable')),
    });
    await expect(photos(down).handle({ contentItemId: itemId })).rejects.toThrow();
    expect((await itemOf(itemId)).sanitizeFailedAt).toBeNull();

    await photos(down).onFinalFailure({ contentItemId: itemId });
    const item = await itemOf(itemId);
    expect(item).toMatchObject({ processingStatus: 'READY', sanitizedAt: null });
    expect(item.sanitizeFailedAt).not.toBeNull();
    // A later job (or sweep) leaves it alone.
    await photos().handle({ contentItemId: itemId });
    expect((await itemOf(itemId)).sanitizedAt).toBeNull();
  });

  test('backfill: a READY item from before is only sanitised; its previews stay', async () => {
    const { itemId, storageKey } = await addMedia('PHOTO', fixture('location.jpg'), 'image/jpeg');
    await prisma.contentItem.update({ where: { id: itemId }, data: { processingStatus: 'READY' } });

    await photos().handle({ contentItemId: itemId });

    expect(await itemOf(itemId)).toMatchObject({ processingStatus: 'READY' });
    expect((await itemOf(itemId)).sanitizedAt).not.toBeNull();
    expect(await stored(storageKey, exiftoolLocationTags)).toEqual({});
    expect((await mediaRows(itemId)).map((row) => row.role)).toEqual(['ORIGINAL']);
  });

  test('an admin image (cover) loses its GPS before its renditions; its size follows', async () => {
    const jpeg = fixture('location.jpg');
    const owner = await prisma.user.create({ data: { email: `owner${++sequence}@example.com` } });
    const collection = await prisma.collection.create({
      data: { ownerId: owner.id, title: 'Весілля' },
    });
    const image = await prisma.collectionImage.create({
      data: {
        collectionId: collection.id,
        slot: 'COVER',
        source: 'UPLOAD',
        mimeType: 'image/jpeg',
        originalSizeBytes: BigInt(jpeg.length),
      },
    });
    const key = imageKey(collection.id, 'COVER', image.id, 'original');
    await storage.putObject(key, jpeg, 'image/jpeg', jpeg.length);

    await new CollectionImageDerivativesHandler(prisma, storage, slots, sanitizer).handle({
      collectionId: collection.id,
      imageId: image.id,
    });

    const row = await prisma.collectionImage.findUniqueOrThrow({ where: { id: image.id } });
    expect(row.status).toBe('READY');
    expect(row.sanitizedAt).not.toBeNull();
    expect(await stored(key, exiftoolLocationTags)).toEqual({});
    expect(row.originalSizeBytes).toBe(BigInt((await storage.head(key))?.size ?? 0));
    expect(row.originalSizeBytes).toBeLessThan(BigInt(jpeg.length));
  });
});
