import { describe, expect, test } from 'vitest';
import { EnvValidationError, loadApiEnv } from './env.js';

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
      LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT: 3,
      LIMIT_STORAGE_BYTES_PER_ACCOUNT: 20n * 1024n ** 3n,
      LIMIT_STORAGE_BYTES_PER_COLLECTION: 10n * 1024n ** 3n,
    });
    expect(env.APP_SECRET).toHaveLength(32);
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.S3_ENDPOINT).toBeUndefined();
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
});
