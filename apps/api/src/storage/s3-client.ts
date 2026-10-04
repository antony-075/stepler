import { S3Client } from '@aws-sdk/client-s3';

export interface S3ClientSettings {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** Socket idle limit; per-call deadlines are set by the caller (`abortSignal`). */
  requestTimeoutMs?: number;
}

/** A storage host that does not accept the connection fails fast. */
const CONNECT_TIMEOUT_MS = 3_000;

/**
 * Required settings (ADR 0008, spike S4): with SDK default checksums, presigned PUT URLs embed
 * the CRC32 of an empty body and every real upload fails.
 */
export function createS3Client(settings: S3ClientSettings): S3Client {
  return new S3Client({
    ...(settings.endpoint === undefined ? {} : { endpoint: settings.endpoint }),
    region: settings.region,
    forcePathStyle: settings.forcePathStyle,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: {
      connectionTimeout: CONNECT_TIMEOUT_MS,
      ...(settings.requestTimeoutMs === undefined
        ? {}
        : { requestTimeout: settings.requestTimeoutMs }),
    },
  });
}
