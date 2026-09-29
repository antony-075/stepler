import { describe, expect, test } from 'vitest';
import { healthLiveResponseSchema } from './index.js';

describe('healthLiveResponseSchema', () => {
  test('accepts { status: "ok" }', () => {
    expect(healthLiveResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  test('rejects other statuses and extra keys', () => {
    expect(healthLiveResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
    expect(healthLiveResponseSchema.safeParse({ status: 'ok', db: 'x' }).success).toBe(false);
  });
});
