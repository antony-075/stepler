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

/** The guest upload routes for one collection, as one guest (its `st_gs` cookie). */
export function uploadCalls(server: Server, collectionId: string, cookie: string): UploadCalls {
  const post = (path: string) =>
    request(server).post(path).set('Cookie', cookie).set('Origin', ORIGIN);
  return {
    initiate: (body) =>
      post(base(collectionId)).send({
        clientUploadId: body.clientUploadId ?? randomUUID(),
        filename: body.filename,
        mimeType: body.mimeType ?? '',
        sizeBytes: body.sizeBytes,
      }),
    parts: (uploadId, partNumbers) =>
      post(`${base(collectionId)}/${uploadId}/parts`).send({ partNumbers }),
    complete: (uploadId) => post(`${base(collectionId)}/${uploadId}/complete`),
    cancel: (uploadId) =>
      request(server)
        .delete(`${base(collectionId)}/${uploadId}`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN),
  };
}

export const asSession = (body: unknown): UploadSessionResponse =>
  uploadSessionResponseSchema.parse(body);

/** PUTs bytes to a presigned URL as a browser would, with exactly the signed headers. */
export async function putTo(
  url: string,
  body: Uint8Array,
  headers: Record<string, string> = {},
): Promise<number> {
  const res = await fetch(url, { method: 'PUT', body, headers });
  return res.status;
}

/** Initiates `bytes` as `filename` and stores them with a single PUT; returns the session. */
export async function uploadSingle(
  calls: UploadCalls,
  filename: string,
  bytes: Uint8Array,
): Promise<UploadSessionResponse & { strategy: 'SINGLE' }> {
  const res = await calls.initiate({ filename, sizeBytes: bytes.length });
  if (res.status !== 201) throw new Error(`initiate ${filename}: ${res.status} ${res.text}`);
  const session = asSession(res.body);
  if (session.strategy !== 'SINGLE') throw new Error('expected a single PUT');
  const status = await putTo(session.url, bytes, session.headers);
  if (status !== 200) throw new Error(`PUT ${filename}: ${status}`);
  return session;
}
