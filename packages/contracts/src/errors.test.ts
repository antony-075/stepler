import { describe, expect, test } from 'vitest';
import { ERROR_CODES, healthReadyResponseSchema, problemDetailsSchema } from './index.js';

const problem = {
  type: 'about:blank',
  title: 'Validation failed',
  status: 400,
  code: 'VALIDATION_FAILED',
  retryable: false,
  requestId: 'req-12345678',
};

describe('problemDetailsSchema', () => {
  test('accepts a valid problem', () => {
    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });

  test('rejects an unknown code', () => {
    expect(problemDetailsSchema.safeParse({ ...problem, code: 'NOPE' }).success).toBe(false);
  });

  test('accepts mixed string/number issue paths', () => {
    const parsed = problemDetailsSchema.parse({
      ...problem,
      errors: [{ path: ['items', 0, 'name'], message: 'Required' }],
    });
    expect(parsed.errors?.[0]?.path).toEqual(['items', 0, 'name']);
  });

  test('every error code is unique', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});

describe('healthReadyResponseSchema', () => {
  const ready = { status: 'ok', checks: { database: 'ok', storage: 'ok' } };

  test('accepts a readiness body', () => {
    expect(healthReadyResponseSchema.parse(ready)).toEqual(ready);
  });

  test('rejects extra keys', () => {
    expect(healthReadyResponseSchema.safeParse({ ...ready, extra: 1 }).success).toBe(false);
    expect(
      healthReadyResponseSchema.safeParse({ ...ready, checks: { ...ready.checks, cache: 'ok' } })
        .success,
    ).toBe(false);
  });
});
