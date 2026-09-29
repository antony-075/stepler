import { type ApiEnv, loadApiEnv } from '../../src/config/env.js';

/**
 * A valid API environment for tests. Service URLs point at `docker/compose.yaml` and can be
 * overridden through the process environment (CI) or per test.
 */
export function testEnv(overrides: Record<string, string> = {}): ApiEnv {
  const p = process.env;
  return loadApiEnv({
    NODE_ENV: 'test',
    API_PORT: '4000',
    LOG_LEVEL: 'error',
    APP_ORIGIN: 'http://localhost:3000',
    DATABASE_URL:
      p.TEST_DATABASE_URL ?? 'postgresql://stepler:stepler-local@127.0.0.1:5433/stepler_test',
    SMTP_URL: p.TEST_SMTP_URL ?? 'smtp://127.0.0.1:1025',
    MAIL_FROM: 'Stepler <no-reply@stepler.test>',
    TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    APP_SECRET: Buffer.alloc(32, 7).toString('base64'),
    S3_ENDPOINT: p.TEST_S3_ENDPOINT ?? 'http://127.0.0.1:8333',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'stepler-test',
    S3_ACCESS_KEY_ID: p.TEST_S3_ACCESS_KEY_ID ?? 'stepler',
    S3_SECRET_ACCESS_KEY: p.TEST_S3_SECRET_ACCESS_KEY ?? 'stepler-local-secret',
    S3_FORCE_PATH_STYLE: 'true',
    ...overrides,
  });
}
