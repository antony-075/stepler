import type { Readable } from 'node:stream';

/** Injection token for the `ObjectStorage` port. */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface PresignPutOptions {
  /** Signed: the browser must send exactly this Content-Type. */
  contentType: string;
  /** Signed: the browser must send exactly this many bytes. */
  contentLength: number;
  expiresInSeconds: number;
}

export interface PresignGetOptions {
  expiresInSeconds: number;
  /** Overrides the stored type in the response (e.g. the verified MIME type). */
  contentType?: string;
  contentDisposition?: string;
  /**
   * Signs as of this moment instead of now. Callers align it to a window so the same object
   * gets the same URL for the whole window (browser-cacheable, spec §10.6).
   */
  signingDate?: Date;
}

/** One uploaded part of a multipart upload, as storage reports it. */
export interface StoredPart {
  partNumber: number;
  etag: string;
  size: number;
}

export interface ObjectHead {
  size: number;
  contentType?: string;
}

/** S3 DeleteObjects accepts at most this many keys per call. */
export const MAX_DELETE_KEYS = 1000;

export interface ListKeysOptions {
  /** The provider caps a page at 1000 keys. */
  limit?: number;
  /** `nextToken` of the previous page. */
  token?: string;
}

export interface KeyPage {
  keys: string[];
  /** Set when more keys follow. */
  nextToken?: string;
}

/**
 * Object storage behind a port (rule 02). Presigned URLs are credentials: never log them.
 * Browsers upload straight to storage (ADR 0003, 0008); the server creates and completes
 * multipart uploads itself and never trusts a client's ETags.
 */
export interface ObjectStorage {
  /** Throws when the bucket is unreachable or missing. */
  checkHealth(): Promise<void>;
  presignPut(key: string, options: PresignPutOptions): Promise<string>;
  presignGet(key: string, options: PresignGetOptions): Promise<string>;
  /** `null` when the object does not exist. */
  head(key: string): Promise<ObjectHead | null>;
  /** Idempotent: deleting a missing key succeeds. */
  delete(key: string): Promise<void>;
  /** One page of keys under `prefix`, in key order. */
  listKeys(prefix: string, options?: ListKeysOptions): Promise<KeyPage>;
  /** Deletes up to `MAX_DELETE_KEYS` keys; missing keys succeed. Throws if any key fails. */
  deleteMany(keys: readonly string[]): Promise<void>;
  /** Idempotent: aborting an unknown or finished multipart upload succeeds. */
  abortMultipart(key: string, uploadId: string): Promise<void>;
  /** Starts a multipart upload; returns storage's upload id. */
  createMultipart(key: string, contentType: string): Promise<string>;
  /** A presigned PUT for one part; it signs `contentLength`, so a part of another size fails. */
  presignPart(
    key: string,
    uploadId: string,
    partNumber: number,
    contentLength: number,
    expiresInSeconds: number,
  ): Promise<string>;
  /**
   * Every uploaded part, across pages, by part number; `null` when the multipart upload no longer
   * exists (completed or aborted).
   */
  listParts(key: string, uploadId: string): Promise<StoredPart[] | null>;
  /** Assembles the object from these parts (ETags as `listParts` returned them). */
  completeMultipart(
    key: string,
    uploadId: string,
    parts: readonly Pick<StoredPart, 'partNumber' | 'etag'>[],
  ): Promise<void>;
  /**
   * Streams the object into the file at `path` (the worker's derivative inputs; never into
   * memory). Returns `false` when the object does not exist.
   */
  downloadToFile(key: string, path: string): Promise<boolean>;
  /** Bytes `start`…`endInclusive` (fewer when the object is shorter). Small reads only. */
  readRange(key: string, start: number, endInclusive: number): Promise<Uint8Array>;
  /** Server-side write (derivatives); never used for guest uploads. */
  putObject(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    contentLength?: number,
  ): Promise<void>;
}
