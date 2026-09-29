// Dev/CI only: creates the local emulator buckets and their CORS rule, idempotently.
// Staging and production buckets are provisioned outside the app (ADR 0008, spike S4).
// Run: pnpm --filter @stepler/api storage:bootstrap
import {
  CreateBucketCommand,
  HeadBucketCommand,
  NotFound,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { createS3Client } from '../src/storage/s3-client.ts';

const BUCKETS = ['stepler-dev', 'stepler-test'];
// Web dev server, and the e2e production server on 3100.
const ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://127.0.0.1:3100'];

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is not set`);
  return value;
}

const client = createS3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:8333',
  region: process.env.S3_REGION ?? 'us-east-1',
  accessKeyId: required('S3_ACCESS_KEY_ID'),
  secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
  forcePathStyle: true,
});

for (const Bucket of BUCKETS) {
  try {
    await client.send(new HeadBucketCommand({ Bucket }));
  } catch (error) {
    if (!(error instanceof NotFound)) throw error;
    await client.send(new CreateBucketCommand({ Bucket }));
  }
  await client.send(
    new PutBucketCorsCommand({
      Bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ORIGINS,
            AllowedMethods: ['PUT', 'GET'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 600,
          },
        ],
      },
    }),
  );
  process.stdout.write(`bucket ${Bucket}: ready\n`);
}
client.destroy();
