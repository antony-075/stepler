import { describe, expect, test } from 'vitest';
import { EnvValidationError } from '../config/env.js';
import { loadWorkerEnv } from './worker-env.js';

const valid = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://stepler:secret@db.internal:5432/stepler',
  S3_REGION: 'auto',
  S3_BUCKET: 'stepler-staging',
  S3_ACCESS_KEY_ID: 'key-id',
  S3_SECRET_ACCESS_KEY: 'secret-key',
};

describe('loadWorkerEnv', () => {
  test('needs no SMTP, Turnstile or APP_SECRET and applies defaults', () => {
    const env = loadWorkerEnv(valid);
    expect(env).toMatchObject({
      LOG_LEVEL: 'info',
      S3_FORCE_PATH_STYLE: false,
      WORKER_MEDIA_CONCURRENCY: 1,
      WORKER_PURGE_BATCH_SIZE: 500,
      GUEST_SESSION_IDLE_DAYS: 400,
    });
  });

  test('names a missing S3_BUCKET without printing values', () => {
    let error: unknown;
    try {
      loadWorkerEnv({ ...valid, S3_BUCKET: undefined });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EnvValidationError);
    expect((error as EnvValidationError).variables).toEqual(['S3_BUCKET']);
    expect((error as Error).message).not.toContain('secret');
  });

  test('rejects a purge batch larger than one S3 delete call', () => {
    expect(() => loadWorkerEnv({ ...valid, WORKER_PURGE_BATCH_SIZE: '1001' })).toThrow(
      EnvValidationError,
    );
  });

  test('reads the idle-session window', () => {
    expect(loadWorkerEnv({ ...valid, GUEST_SESSION_IDLE_DAYS: '30' }).GUEST_SESSION_IDLE_DAYS).toBe(
      30,
    );
  });
});
