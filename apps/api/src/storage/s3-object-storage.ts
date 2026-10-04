import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchUpload,
  NotFound,
  PutObjectCommand,
  type S3Client,
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
>;

/** Without this the SDK leaves Content-Type unsigned and any type can be uploaded (spike S4). */
const SIGNED_PUT_HEADERS = new Set(['content-type']);

/** S3-compatible adapter: Cloudflare R2 in deployed environments, SeaweedFS locally. */
@Injectable()
export class S3ObjectStorage implements ObjectStorage, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(API_ENV) env: StorageEnv) {
    this.bucket = env.S3_BUCKET;
    this.client = createS3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }

  async checkHealth(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
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
    return getSignedUrl(this.client, command, { expiresIn: options.expiresInSeconds });
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
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
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async listKeys(prefix: string, options: ListKeysOptions = {}): Promise<KeyPage> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ...(options.limit === undefined ? {} : { MaxKeys: options.limit }),
        ...(options.token === undefined ? {} : { ContinuationToken: options.token }),
      }),
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
      );
    } catch (error) {
      if (error instanceof NoSuchUpload) return;
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
