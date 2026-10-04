import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { type UploadSessionResponse, uploadSessionResponseSchema } from '@stepler/contracts';
import request from 'supertest';
import { ORIGIN } from './guests.js';

/** A committed media fixture (`test/fixtures/media/`). */
export const fixture = (name: string): Buffer =>
  readFileSync(new URL(`../fixtures/media/${name}`, import.meta.url));

/** `size` bytes that start with `header` (a real file's signature), zero-filled. */
export function bigBuffer(size: number, header: Uint8Array): Buffer {
  const buffer = Buffer.alloc(size);
  buffer.set(header.subarray(0, Math.min(header.length, size)));
  return buffer;
}

const base = (collectionId: string) => `/api/v1/guest/collections/${collectionId}/uploads`;
const coverBase = (collectionId: string) => `/api/v1/collections/${collectionId}/cover/uploads`;

export interface UploadCalls {
  initiate(body: {
    filename: string;
    sizeBytes: number;
    mimeType?: string;
    clientUploadId?: string;
  }): request.Test;
  parts(uploadId: string, partNumbers: number[]): request.Test;
  complete(uploadId: string): request.Test;
  cancel(uploadId: string): request.Test;
}

/** The four upload routes under `root`, as the holder of `cookie` (a guest's or an admin's). */
function callsAt(server: Server, root: string, cookie: string): UploadCalls {
  const post = (path: string) =>
    request(server).post(path).set('Cookie', cookie).set('Origin', ORIGIN);
  return {
    initiate: (body) =>
      post(root).send({
        clientUploadId: body.clientUploadId ?? randomUUID(),
        filename: body.filename,
        mimeType: body.mimeType ?? '',
        sizeBytes: body.sizeBytes,
      }),
    parts: (uploadId, partNumbers) => post(`${root}/${uploadId}/parts`).send({ partNumbers }),
    complete: (uploadId) => post(`${root}/${uploadId}/complete`),
    cancel: (uploadId) =>
      request(server).delete(`${root}/${uploadId}`).set('Cookie', cookie).set('Origin', ORIGIN),
  };
}

/** The guest upload routes for one collection, as one guest (its `st_gs` cookie). */
export const uploadCalls = (server: Server, collectionId: string, cookie: string): UploadCalls =>
  callsAt(server, base(collectionId), cookie);

/** The admin's cover upload routes for one collection, as the holder of an admin session. */
export const coverUploadCalls = (
  server: Server,
  collectionId: string,
  cookie: string,
): UploadCalls => callsAt(server, coverBase(collectionId), cookie);

export const asSession = (body: unknown): UploadSessionResponse =>
  uploadSessionResponseSchema.parse(body);

/** PUTs bytes to a presigned URL as a browser would. */
export async function putTo(url: string, body: Uint8Array): Promise<number> {
  const res = await fetch(url, { method: 'PUT', body });
  return res.status;
}

/** Part URLs of an open upload, by part number. */
export async function partUrls(
  calls: UploadCalls,
  uploadId: string,
  partNumbers: number[],
): Promise<Map<number, string>> {
  const res = await calls.parts(uploadId, partNumbers);
  if (res.status !== 200) throw new Error(`parts: ${res.status} ${res.text}`);
  const { parts } = res.body as { parts: { partNumber: number; url: string }[] };
  return new Map(parts.map((part) => [part.partNumber, part.url]));
}

/** Part `n` (1-based) of `bytes` for this session's part size. */
export const partOf = (bytes: Uint8Array, session: UploadSessionResponse, n: number) =>
  bytes.subarray(
    (n - 1) * session.partSizeBytes,
    Math.min(n * session.partSizeBytes, bytes.length),
  );

/** Initiates `bytes` as `filename` and stores every part; returns the session (not completed). */
export async function uploadFile(
  calls: UploadCalls,
  filename: string,
  bytes: Uint8Array,
): Promise<UploadSessionResponse & { urls: Map<number, string> }> {
  const res = await calls.initiate({ filename, sizeBytes: bytes.length });
  if (res.status !== 201) throw new Error(`initiate ${filename}: ${res.status} ${res.text}`);
  const session = asSession(res.body);
  const numbers = Array.from({ length: session.partCount }, (_, i) => i + 1);
  const urls = await partUrls(calls, session.uploadId, numbers);
  for (const n of numbers) {
    const status = await putTo(urls.get(n) ?? '', partOf(bytes, session, n));
    if (status !== 200) throw new Error(`PUT ${filename} part ${n}: ${status}`);
  }
  return { ...session, urls };
}
