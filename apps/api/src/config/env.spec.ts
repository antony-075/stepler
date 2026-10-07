import { describe, expect, test } from 'vitest';
import { EnvValidationError, loadApiEnv, retiredVariablesIn } from './env.js';

const SECRET_32 = Buffer.alloc(32, 7).toString('base64');

/** A complete, valid environment; tests override single variables. */
const base: Record<string, string> = {
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://stepler:pw@127.0.0.1:5433/stepler_test',
  SMTP_URL: 'smtp://127.0.0.1:1025',
  MAIL_FROM: 'Stepler <no-reply@stepler.test>',
  TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  APP_SECRET: SECRET_32,
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'stepler-test',
  S3_ACCESS_KEY_ID: 'dev',
  S3_SECRET_ACCESS_KEY: 'devsecret',
};

describe('loadApiEnv', () => {
  test('parses a full environment and applies defaults', () => {
    const env = loadApiEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: 'test',
      API_PORT: 4000,
      LOG_LEVEL: 'info',
      APP_ORIGIN: 'http://localhost:3000',
      COOKIE_SECURE: false,
      SESSION_TTL_DAYS: 30,
      MAGIC_LINK_TTL_MINUTES: 15,
      OPERATOR_EMAILS: [],
      API_TRUST_PROXY: false,
      S3_FORCE_PATH_STYLE: false,
      LIMIT_MAGIC_LINK_PER_EMAIL_PER_HOUR: 5,
      LIMIT_MAGIC_LINK_PER_IP_PER_HOUR: 20,
      LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR: 60,
      LIMIT_COLLECTION_CREATIONS_PER_DAY: 10,
      LIMIT_REPORTS_PER_IP_PER_HOUR: 60,
      LIMIT_REPORTS_PER_GUEST_SESSION_PER_HOUR: 10,
      LIMIT_APPEALS_PER_ACCOUNT_PER_DAY: 20,
      MODERATION_QUARANTINE_DAYS: 90,
    });
    expect(env.APP_SECRET).toHaveLength(32);
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.S3_ENDPOINT).toBeUndefined();
  });

  test('the limits that became entitlements are accepted, ignored and named for a warning', () => {
    const source = {
      ...base,
      LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT: '3',
      LIMIT_GUEST_LINKS_PER_COLLECTION: 'x',
    };
    expect(loadApiEnv(source)).not.toHaveProperty('LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT');
    expect(retiredVariablesIn(source)).toEqual([
      'LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT',
      'LIMIT_GUEST_LINKS_PER_COLLECTION',
    ]);
    expect(retiredVariablesIn(base)).toEqual([]);
  });

  test('coerces API_PORT', () => {
    expect(loadApiEnv({ ...base, API_PORT: '8080' }).API_PORT).toBe(8080);
  });

  test('rejects port 0 (random port) in configuration', () => {
    expect(() => loadApiEnv({ ...base, API_PORT: '0' })).toThrow(/API_PORT/);
  });

  test('requires NODE_ENV', () => {
    expect(() => loadApiEnv({ ...base, NODE_ENV: undefined })).toThrow(/NODE_ENV/);
  });

  test('lists every invalid variable name', () => {
    expect(() => loadApiEnv({ ...base, NODE_ENV: 'staging', API_PORT: 'abc' })).toThrow(
      EnvValidationError,
    );
    expect(() => loadApiEnv({ ...base, NODE_ENV: 'staging', API_PORT: 'abc' })).toThrow(
      /NODE_ENV.*API_PORT|API_PORT.*NODE_ENV/s,
    );
  });

  test('COOKIE_SECURE defaults to true only in production', () => {
    expect(loadApiEnv({ ...base, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
    expect(loadApiEnv({ ...base, NODE_ENV: 'development' }).COOKIE_SECURE).toBe(false);
    expect(
      loadApiEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' }).COOKIE_SECURE,
    ).toBe(false);
  });

  test('APP_ORIGIN must be a bare http(s) origin', () => {
    expect(() => loadApiEnv({ ...base, APP_ORIGIN: 'http://localhost:3000/app' })).toThrow(
      /APP_ORIGIN/,
    );
    expect(() => loadApiEnv({ ...base, APP_ORIGIN: 'ftp://localhost' })).toThrow(/APP_ORIGIN/);
  });

  test('OPERATOR_EMAILS is trimmed and lowercased', () => {
    expect(loadApiEnv({ ...base, OPERATOR_EMAILS: ' A@x.io, b@y.io ' }).OPERATOR_EMAILS).toEqual([
      'a@x.io',
      'b@y.io',
    ]);
  });

  test('API_TRUST_PROXY accepts false, a hop count or an Express trust string', () => {
    expect(loadApiEnv({ ...base, API_TRUST_PROXY: 'false' }).API_TRUST_PROXY).toBe(false);
    expect(loadApiEnv({ ...base, API_TRUST_PROXY: '1' }).API_TRUST_PROXY).toBe(1);
    expect(loadApiEnv({ ...base, API_TRUST_PROXY: 'loopback' }).API_TRUST_PROXY).toBe('loopback');
    expect(() => loadApiEnv({ ...base, API_TRUST_PROXY: 'true' })).toThrow(/API_TRUST_PROXY/);
  });

  test('GOOGLE_CLIENT_ID without the secret fails naming both', () => {
    expect(() => loadApiEnv({ ...base, GOOGLE_CLIENT_ID: 'id' })).toThrow(
      /GOOGLE_CLIENT_ID.*GOOGLE_CLIENT_SECRET/s,
    );
    const env = loadApiEnv({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
    expect(env.GOOGLE_CLIENT_ID).toBe('id');
  });

  test('APP_SECRET shorter than 32 decoded bytes fails', () => {
    const short = Buffer.alloc(31, 1).toString('base64');
    expect(() => loadApiEnv({ ...base, APP_SECRET: short })).toThrow(/APP_SECRET/);
    expect(() => loadApiEnv({ ...base, APP_SECRET: 'not base64!' })).toThrow(/APP_SECRET/);
  });

  test('never includes values in the error message', () => {
    const secret = 'postgres://user:s3cr3t@host/db';
    expect(() => loadApiEnv({ ...base, NODE_ENV: secret })).toThrow(/NODE_ENV/);
    expect(() => loadApiEnv({ ...base, NODE_ENV: secret })).not.toThrow(/s3cr3t/);
    expect(() => loadApiEnv({ ...base, DATABASE_URL: `mysql://u:${secret}` })).not.toThrow(
      /s3cr3t/,
    );
  });

  describe('billing (ADR 0018)', () => {
    const liqpay = {
      BILLING_PROVIDER: 'liqpay',
      LIQPAY_PUBLIC_KEY: 'sandbox_i00000000',
      LIQPAY_PRIVATE_KEY: 'sandbox_test-private',
    };
    const production = {
      ...base,
      NODE_ENV: 'production',
      BILLING_CALLBACK_URL: 'https://api.stepler.test/api/v1/billing/liqpay/callback',
    };

    test('payments are disabled by default and the keys are optional then', () => {
      const env = loadApiEnv(base);
      expect(env).toMatchObject({
        BILLING_PROVIDER: 'disabled',
        LIQPAY_API_BASE: 'https://www.liqpay.ua',
        BILLING_PENDING_TTL_MINUTES: 30,
        BILLING_FISCAL_MODE: 'none',
        BILLING_FISCAL_WAIVED: false,
        LIMIT_BILLING_CALLBACKS_PER_IP_PER_MINUTE: 120,
        LIMIT_BILLING_CHECKOUTS_PER_USER_PER_HOUR: 20,
      });
      expect(env.BILLING_CALLBACK_URL).toBeUndefined();
    });

    test('BILLING_PROVIDER=liqpay without both keys fails naming them', () => {
      expect(() => loadApiEnv({ ...base, BILLING_PROVIDER: 'liqpay' })).toThrow(
        /LIQPAY_PUBLIC_KEY.*LIQPAY_PRIVATE_KEY/s,
      );
      expect(loadApiEnv({ ...base, ...liqpay }).BILLING_PROVIDER).toBe('liqpay');
    });

    test('production needs the callback URL', () => {
      expect(() => loadApiEnv({ ...production, ...liqpay, BILLING_CALLBACK_URL: '' })).toThrow(
        /BILLING_CALLBACK_URL/,
      );
      expect(loadApiEnv({ ...production, ...liqpay }).BILLING_PROVIDER).toBe('liqpay');
    });

    test('live keys in production need a fiscal mode or the deliberate waiver [P14]', () => {
      const live = { ...production, ...liqpay, LIQPAY_PUBLIC_KEY: 'i12345678' };
      expect(() => loadApiEnv(live)).toThrow(/BILLING_FISCAL_MODE/);
      expect(loadApiEnv({ ...live, BILLING_FISCAL_MODE: 'liqpay_rro' }).BILLING_FISCAL_MODE).toBe(
        'liqpay_rro',
      );
      expect(loadApiEnv({ ...live, BILLING_FISCAL_WAIVED: 'true' }).BILLING_FISCAL_WAIVED).toBe(
        true,
      );
    });

    test('a key never appears in the error', () => {
      expect(() =>
        loadApiEnv({ ...base, BILLING_PROVIDER: 'liqpay', LIQPAY_PRIVATE_KEY: 'top-secret-key' }),
      ).not.toThrow(/top-secret-key/);
    });
  });
});
