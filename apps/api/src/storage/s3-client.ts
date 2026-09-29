import { S3Client } from '@aws-sdk/client-s3';

export interface S3ClientSettings {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

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
  });
}
