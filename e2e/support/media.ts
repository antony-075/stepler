import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

/** Path of a committed media fixture (`apps/api/test/fixtures/media/`). */
export const fixture = (name: string): string =>
  fileURLToPath(new URL(`../../apps/api/test/fixtures/media/${name}`, import.meta.url));

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  heic: 'image/heic',
};

/** A fixture as a picked file (buffers, since Playwright cannot mix them with paths). */
export function pickedFile(name: string): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name,
    mimeType: MIME[name.split('.').pop() ?? ''] ?? 'application/octet-stream',
    buffer: readFileSync(fixture(name)),
  };
}

/** `size` bytes starting with a real file's head (its signature), zero-filled. */
export function bigBuffer(size: number, headerOf: string): Buffer {
  const buffer = Buffer.alloc(size);
  readFileSync(fixture(headerOf)).subarray(0, 4096).copy(buffer);
  return buffer;
}

/**
 * Uploads a fixture through the API as the guest of `page` (its session cookie), the way the
 * browser transport does: initiate, sign the parts, PUT them, complete. For admin journeys that
 * only need frames to exist.
 */
export async function uploadViaApi(
  page: Page,
  collectionId: string,
  name: string,
): Promise<{ id: string; frameNo: number }> {
  const bytes = readFileSync(fixture(name));
  const base = `/api/v1/guest/collections/${collectionId}/uploads`;
  const headers = { origin: new URL(page.url()).origin };
  const init = await page.request.post(base, {
    data: { clientUploadId: randomUUID(), filename: name, mimeType: '', sizeBytes: bytes.length },
    headers,
  });
  expect(init.status()).toBe(201);
  const session = (await init.json()) as {
    uploadId: string;
    partSizeBytes: number;
    partCount: number;
  };
  const numbers = Array.from({ length: session.partCount }, (_, i) => i + 1);
  const parts = await page.request.post(`${base}/${session.uploadId}/parts`, {
    data: { partNumbers: numbers },
    headers,
  });
  expect(parts.status()).toBe(200);
  for (const part of ((await parts.json()) as { parts: { partNumber: number; url: string }[] })
    .parts) {
    const start = (part.partNumber - 1) * session.partSizeBytes;
    const res = await page.request.put(part.url, {
      data: bytes.subarray(start, start + session.partSizeBytes),
    });
    expect(res.status()).toBe(200);
  }
  const done = await page.request.post(`${base}/${session.uploadId}/complete`, { headers });
  expect(done.status()).toBe(200);
  return (await done.json()) as { id: string; frameNo: number };
}
