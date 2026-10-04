import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  NoSuchKey,
  NoSuchUpload,
  NotFound,
  PutObjectCommand,
  type S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import {
  type KeyPage,
  type ListKeysOptions,
  MAX_DELETE_KEYS,
  type ObjectHead,
  type ObjectStorage,
  type PresignGetOptions,
  type PresignPutOptions,
  type StoredPart,
} from './object-storage.js';
import { createS3Client } from './s3-client.js';

type StorageEnv = Pick<
  ApiEnv,
  | 'S3_ENDPOINT'
  | 'S3_REGION'
  | 'S3_BUCKET'
  | 'S3_ACCESS_KEY_ID'
  | 'S3_SECRET_ACCESS_KEY'
  | 'S3_FORCE_PATH_STYLE'
  | 'S3_REQUEST_TIMEOUT_MS'
  | 'S3_COMPLETE_TIMEOUT_MS'
>;

/** Without this the SDK leaves Content-Type unsigned and any type can be uploaded (spike S4). */
const SIGNED_PUT_HEADERS = new Set(['content-type']);

/** S3-compatible adapter: Cloudflare R2 in deployed environments, SeaweedFS locally. */
@Injectable()
export class S3ObjectStorage implements ObjectStorage, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly timeoutMs: number;
  private readonly completeTimeoutMs: number;

  constructor(@Inject(API_ENV) env: StorageEnv) {
    this.bucket = env.S3_BUCKET;
    this.timeoutMs = env.S3_REQUEST_TIMEOUT_MS;
    this.completeTimeoutMs = env.S3_COMPLETE_TIMEOUT_MS;
    this.client = createS3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      requestTimeoutMs: env.S3_COMPLETE_TIMEOUT_MS,
    });
  }

  async checkHealth(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), this.deadline());
  }

  presignPut(key: string, options: PresignPutOptions): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.contentLength,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds,
      signableHeaders: SIGNED_PUT_HEADERS,
    });
  }

  presignGet(key: string, options: PresignGetOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options.contentType === undefined ? {} : { ResponseContentType: options.contentType }),
      ...(options.contentDisposition === undefined
        ? {}
        : { ResponseContentDisposition: options.contentDisposition }),
    });
    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds,
      ...(options.signingDate === undefined ? {} : { signingDate: options.signingDate }),
    });
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        this.deadline(),
      );
      return {
        size: res.ContentLength ?? 0,
        ...(res.ContentType === undefined ? {} : { contentType: res.ContentType }),
      };
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    // S3 DeleteObject succeeds for missing keys.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      this.deadline(),
    );
  }

  async listKeys(prefix: string, options: ListKeysOptions = {}): Promise<KeyPage> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ...(options.limit === undefined ? {} : { MaxKeys: options.limit }),
        ...(options.token === undefined ? {} : { ContinuationToken: options.token }),
      }),
      this.deadline(),
    );
    const keys = (res.Contents ?? []).flatMap((object) =>
      object.Key === undefined ? [] : [object.Key],
    );
    return res.IsTruncated === true && res.NextContinuationToken !== undefined
      ? { keys, nextToken: res.NextContinuationToken }
      : { keys };
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    if (keys.length > MAX_DELETE_KEYS) {
      throw new RangeError(`deleteMany takes at most ${MAX_DELETE_KEYS} keys`);
    }
    const res = await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
      this.deadline(),
    );
    // Missing keys are not errors in S3; anything reported here is a real failure.
    const failed = res.Errors?.length ?? 0;
    if (failed > 0) {
      throw new Error(`deleteMany failed for ${failed} of ${keys.length} keys`);
    }
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
        this.deadline(),
      );
    } catch (error) {
      if (error instanceof NoSuchUpload) return;
      throw error;
    }
  }

  async createMultipart(key: string, contentType: string): Promise<string> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      this.deadline(),
    );
    if (res.UploadId === undefined) throw new Error('CreateMultipartUpload returned no UploadId');
    return res.UploadId;
  }

  presignPart(
    key: string,
    uploadId: string,
    partNumber: number,
    contentLength: number,
    expiresInSeconds: number,
  ): Promise<string> {
    // ContentLength is signed: a part of another size is refused (and R2's equal-part rule
    // holds, ADR 0008 S4).
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      ContentLength: contentLength,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async listParts(key: string, uploadId: string): Promise<StoredPart[] | null> {
    const parts: StoredPart[] = [];
    let marker: string | undefined;
    for (;;) {
      const res = await this.sendListParts(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          ...(marker === undefined ? {} : { PartNumberMarker: marker }),
        }),
      );
      if (res === null) return null;
      for (const part of res.Parts ?? []) {
        if (part.PartNumber === undefined || part.ETag === undefined) continue;
        parts.push({ partNumber: part.PartNumber, etag: part.ETag, size: part.Size ?? 0 });
      }
      if (res.IsTruncated !== true || res.NextPartNumberMarker === undefined) break;
      marker = res.NextPartNumberMarker;
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  private async sendListParts(command: ListPartsCommand) {
    try {
      return await this.client.send(command, this.deadline());
    } catch (error) {
      if (error instanceof NoSuchUpload) return null;
      throw error;
    }
  }

  async completeMultipart(
    key: string,
    uploadId: string,
    parts: readonly Pick<StoredPart, 'partNumber' | 'etag'>[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
        },
      }),
      // Assembling a 2 GB upload can take a while.
      this.deadline(this.completeTimeoutMs),
    );
  }

  async downloadToFile(key: string, path: string): Promise<boolean> {
    let body: unknown;
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        // Covers the whole transfer, not only the response headers.
        this.deadline(this.completeTimeoutMs),
      );
      body = res.Body;
    } catch (error) {
      if (error instanceof NoSuchKey) return false;
      throw error;
    }
    if (!(body instanceof Readable)) throw new Error('GetObject returned no stream');
    await pipeline(body, createWriteStream(path));
    return true;
  }

  async readRange(key: string, start: number, endInclusive: number): Promise<Uint8Array> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=${start}-${endInclusive}`,
      }),
      this.deadline(),
    );
    if (res.Body === undefined) return new Uint8Array();
    return res.Body.transformToByteArray();
  }

  async putObject(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    contentLength?: number,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(contentLength === undefined ? {} : { ContentLength: contentLength }),
      }),
      this.deadline(this.completeTimeoutMs),
    );
  }

  /**
   * Every storage call has a deadline (review I2): a hung storage fails the request (the API
   * answers 503, retryable) instead of holding it.
   */
  private deadline(timeoutMs: number = this.timeoutMs): { abortSignal: AbortSignal } {
    return { abortSignal: AbortSignal.timeout(timeoutMs) };
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
