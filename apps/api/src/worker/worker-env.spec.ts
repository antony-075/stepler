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
  APP_ORIGIN: 'https://stepler.app',
  SMTP_URL: 'smtp://mail.internal:587',
  MAIL_FROM: 'Stepler <no-reply@stepler.app>',
};

describe('loadWorkerEnv', () => {
  test('needs no Turnstile or APP_SECRET and applies defaults', () => {
    const env = loadWorkerEnv(valid);
    expect(env).toMatchObject({
      LOG_LEVEL: 'info',
      S3_FORCE_PATH_STYLE: false,
      WORKER_MEDIA_CONCURRENCY: 1,
      WORKER_PURGE_BATCH_SIZE: 500,
      GUEST_SESSION_IDLE_DAYS: 400,
      OPERATOR_EMAILS: [],
      REPORT_EMAIL_RETENTION_DAYS: 90,
      READ_ONLY_RETENTION_MONTHS: 12,
      BILLING_RETENTION_DELETE_ENABLED: false,
    });
    expect(env.LEGAL_CONTACT_EMAIL).toBeUndefined();
  });

  test('the retention deletion is switched on explicitly (ADR 0018 [P6])', () => {
    expect(
      loadWorkerEnv({ ...valid, BILLING_RETENTION_DELETE_ENABLED: 'true' })
        .BILLING_RETENTION_DELETE_ENABLED,
    ).toBe(true);
    expect(() => loadWorkerEnv({ ...valid, BILLING_RETENTION_DELETE_ENABLED: 'yes' })).toThrow(
      EnvValidationError,
    );
    expect(() => loadWorkerEnv({ ...valid, READ_ONLY_RETENTION_MONTHS: '0' })).toThrow(
      EnvValidationError,
    );
  });

  test('sends the report mail (slice 9): SMTP, the sender and the app origin are required', () => {
    for (const name of ['SMTP_URL', 'MAIL_FROM', 'APP_ORIGIN'] as const) {
      let error: unknown;
      try {
        loadWorkerEnv({ ...valid, [name]: undefined });
      } catch (caught) {
        error = caught;
      }
      expect((error as EnvValidationError).variables).toEqual([name]);
    }
    expect(
      loadWorkerEnv({ ...valid, OPERATOR_EMAILS: ' Moderation@Stepler.app ,' }).OPERATOR_EMAILS,
    ).toEqual(['moderation@stepler.app']);
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

  test('reads the payment provider like the API (ADR 0018)', () => {
    expect(loadWorkerEnv(valid).BILLING_PROVIDER).toBe('disabled');
    expect(() => loadWorkerEnv({ ...valid, BILLING_PROVIDER: 'liqpay' })).toThrow(
      /LIQPAY_PUBLIC_KEY/,
    );
  });

  test('live keys in production need a fiscal mode or the deliberate waiver, as the API [P14]', () => {
    const live = {
      ...valid,
      BILLING_PROVIDER: 'liqpay',
      LIQPAY_PUBLIC_KEY: 'i12345678',
      LIQPAY_PRIVATE_KEY: 'live-private-key',
    };
    expect(() => loadWorkerEnv(live)).toThrow(/BILLING_FISCAL_MODE/);
    expect(loadWorkerEnv({ ...live, BILLING_FISCAL_WAIVED: 'true' }).BILLING_FISCAL_WAIVED).toBe(
      true,
    );
    expect(
      loadWorkerEnv({ ...live, LIQPAY_PUBLIC_KEY: 'sandbox_i1', BILLING_FISCAL_MODE: 'none' })
        .BILLING_PROVIDER,
    ).toBe('liqpay');
  });
});
