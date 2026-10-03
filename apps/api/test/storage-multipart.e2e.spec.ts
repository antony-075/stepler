import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';
import { testEnv } from './support/env.js';

const storage = new S3ObjectStorage(testEnv());
const key = (): string => `test/${randomUUID()}`;
const MIB = 1024 * 1024;

const putPart = (url: string, body: Uint8Array) => fetch(url, { method: 'PUT', body });

describe('S3ObjectStorage multipart and range reads (emulator)', () => {
  beforeAll(async () => {
    await storage.checkHealth();
  });

  afterAll(() => {
    storage.onModuleDestroy();
  });

  test('presigned parts 5 MiB + 5 MiB + 1 234 B → listParts sizes → complete → head', async () => {
    const k = key();
    const uploadId = await storage.createMultipart(k, 'video/mp4');
    const sizes = [5 * MIB, 5 * MIB, 1234];
    for (const [index, size] of sizes.entries()) {
      const url = await storage.presignPart(k, uploadId, index + 1, size, 60);
      expect((await putPart(url, new Uint8Array(size).fill(index + 1))).status).toBe(200);
    }
    const parts = (await storage.listParts(k, uploadId)) ?? [];
    expect(parts.map((p) => [p.partNumber, p.size])).toEqual([
      [1, 5 * MIB],
      [2, 5 * MIB],
      [3, 1234],
    ]);
    await storage.completeMultipart(k, uploadId, parts);
    expect((await storage.head(k))?.size).toBe(10 * MIB + 1234);
    // A completed (or aborted) multipart upload is gone.
    expect(await storage.listParts(k, uploadId)).toBeNull();
    expect(await storage.readRange(k, 5 * MIB - 1, 5 * MIB)).toEqual(new Uint8Array([1, 2]));
    await storage.delete(k);
  });

  test('a part of another length than signed is refused', async () => {
    const k = key();
    const uploadId = await storage.createMultipart(k, 'video/mp4');
    const url = await storage.presignPart(k, uploadId, 1, 1000, 60);
    const res = await putPart(url, new Uint8Array(1001));
    expect(res.status).toBe(403);
    expect(await storage.listParts(k, uploadId)).toEqual([]);
    await storage.abortMultipart(k, uploadId);
  });

  test('abortMultipart twice does not throw', async () => {
    const k = key();
    const uploadId = await storage.createMultipart(k, 'video/mp4');
    await storage.abortMultipart(k, uploadId);
    await expect(storage.abortMultipart(k, uploadId)).resolves.toBeUndefined();
  });

  test('readRange(0, 3) of a PDF is %PDF; putObject writes server-side', async () => {
    const k = key();
    const pdf = readFileSync(new URL('fixtures/media/doc.pdf', import.meta.url));
    await storage.putObject(k, pdf, 'application/pdf', pdf.length);
    expect(new TextDecoder().decode(await storage.readRange(k, 0, 3))).toBe('%PDF');
    // A range past the end of a short object returns what there is.
    expect((await storage.readRange(k, 0, 4095)).length).toBe(pdf.length);
    expect(await storage.head(k)).toEqual({ size: pdf.length, contentType: 'application/pdf' });
    await storage.delete(k);
  });

  test('two presignGet with the same aligned signingDate are identical', async () => {
    const signingDate = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    const options = { expiresInSeconds: 7200, signingDate, contentType: 'image/jpeg' };
    const a = await storage.presignGet('collections/x/original', options);
    const b = await storage.presignGet('collections/x/original', options);
    expect(a).toBe(b);
  });
});
