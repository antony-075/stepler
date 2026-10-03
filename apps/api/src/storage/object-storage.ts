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
 * Multipart presigning and range reads are added with the upload slice.
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
}
