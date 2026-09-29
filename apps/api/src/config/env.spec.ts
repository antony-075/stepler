import { describe, expect, test } from 'vitest';
import { EnvValidationError, loadApiEnv } from './env.js';

describe('loadApiEnv', () => {
  test('applies defaults', () => {
    expect(loadApiEnv({ NODE_ENV: 'test' })).toEqual({
      NODE_ENV: 'test',
      API_PORT: 4000,
      LOG_LEVEL: 'info',
    });
  });

  test('coerces API_PORT', () => {
    expect(loadApiEnv({ NODE_ENV: 'production', API_PORT: '8080' }).API_PORT).toBe(8080);
  });

  test('lists invalid variable names', () => {
    expect(() => loadApiEnv({ NODE_ENV: 'staging', API_PORT: 'abc' })).toThrow(EnvValidationError);
    expect(() => loadApiEnv({ NODE_ENV: 'staging', API_PORT: 'abc' })).toThrow(
      /NODE_ENV.*API_PORT|API_PORT.*NODE_ENV/s,
    );
  });

  test('rejects port 0 (random port) in configuration', () => {
    expect(() => loadApiEnv({ NODE_ENV: 'production', API_PORT: '0' })).toThrow(/API_PORT/);
  });

  test('requires NODE_ENV', () => {
    expect(() => loadApiEnv({})).toThrow(/NODE_ENV/);
  });

  test('never includes values in the error message', () => {
    const secret = 'postgres://user:s3cr3t@host/db';
    expect(() => loadApiEnv({ NODE_ENV: secret })).toThrow(/NODE_ENV/);
    expect(() => loadApiEnv({ NODE_ENV: secret })).not.toThrow(/s3cr3t/);
  });
});
