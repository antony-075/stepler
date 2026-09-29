import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';
import { testEnv } from './support/env.js';

const env = testEnv();
const storage = new S3ObjectStorage(env);
const key = (): string => `test/${randomUUID()}`;
const body = new TextEncoder().encode('hello world'); // 11 bytes

async function put(url: string, data: Uint8Array, contentType: string): Promise<Response> {
  return fetch(url, { method: 'PUT', body: data, headers: { 'Content-Type': contentType } });
}

describe('S3ObjectStorage (emulator)', () => {
  beforeAll(async () => {
    await storage.checkHealth();
  });

  afterAll(() => {
    storage.onModuleDestroy();
  });

  test('checkHealth rejects for a missing bucket', async () => {
    const missing = new S3ObjectStorage(testEnv({ S3_BUCKET: `missing-${randomUUID()}` }));
    await expect(missing.checkHealth()).rejects.toThrow();
    missing.onModuleDestroy();
  });

  test('presigned PUT uploads and head returns size and type', async () => {
    const k = key();
    const url = await storage.presignPut(k, {
      contentType: 'text/plain',
      contentLength: body.length,
      expiresInSeconds: 60,
    });
    expect((await put(url, body, 'text/plain')).status).toBe(200);
    expect(await storage.head(k)).toEqual({ size: 11, contentType: 'text/plain' });
  });

  test('presigned PUT rejects a different Content-Length than signed', async () => {
    const k = key();
    const url = await storage.presignPut(k, {
      contentType: 'text/plain',
      contentLength: body.length,
      expiresInSeconds: 60,
    });
    const res = await put(url, new Uint8Array(body.length + 5), 'text/plain');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await storage.head(k)).toBeNull();
  });

  test('presigned PUT rejects a different Content-Type than signed', async () => {
    const k = key();
    const url = await storage.presignPut(k, {
      contentType: 'image/jpeg',
      contentLength: body.length,
      expiresInSeconds: 60,
    });
    const res = await put(url, body, 'text/html');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await storage.head(k)).toBeNull();
  });

  test('presignGet applies content type and disposition', async () => {
    const k = key();
    await put(
      await storage.presignPut(k, {
        contentType: 'text/plain',
        contentLength: body.length,
        expiresInSeconds: 60,
      }),
      body,
      'text/plain',
    );
    const url = await storage.presignGet(k, {
      expiresInSeconds: 60,
      contentType: 'text/plain; charset=utf-8',
      contentDisposition: 'attachment; filename="a.txt"',
    });
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="a.txt"');
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe('hello world');
  });

  test('head of a missing key is null and delete is idempotent', async () => {
    const k = key();
    expect(await storage.head(k)).toBeNull();
    await storage.delete(k);
    await storage.delete(k);
  });
});
