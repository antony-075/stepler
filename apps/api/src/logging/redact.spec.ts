import { describe, expect, test } from 'vitest';
import { redactUrl } from './redact.js';

describe('redactUrl', () => {
  test('redacts OAuth code and state, keeps other params', () => {
    expect(redactUrl('/api/v1/auth/google/callback?code=abc&state=def&x=1')).toBe(
      '/api/v1/auth/google/callback?code=[REDACTED]&state=[REDACTED]&x=1',
    );
  });

  test('redacts token and any X-Amz-* key case-insensitively', () => {
    const out = redactUrl('/p?Token=v111&X-Amz-Signature=v222&x-amz-credential=v333&page=2');
    expect(out).not.toMatch(/v111|v222|v333/);
    expect(out).toContain('X-Amz-Signature=[REDACTED]');
    expect(out).toContain('page=2');
  });

  test('leaves URLs without a query unchanged', () => {
    expect(redactUrl('/api/v1/health/live')).toBe('/api/v1/health/live');
  });

  test('redacts repeated keys and encoded values', () => {
    expect(redactUrl('/p?token=a%20b&token=c')).toBe('/p?token=[REDACTED]&token=[REDACTED]');
  });

  test('redacts a guest link token', () => {
    expect(redactUrl('/x?linkToken=abc&page=2')).toBe('/x?linkToken=[REDACTED]&page=2');
  });

  test('redacts the token in a guest link path (a Referer from /g/<token>)', () => {
    expect(redactUrl('http://localhost:3000/g/abcDEF_-123?x=1')).toBe(
      'http://localhost:3000/g/[REDACTED]?x=1',
    );
    expect(redactUrl('/en/g/abc')).toBe('/en/g/[REDACTED]');
  });

  test('keeps guest collection paths: a collection id is not a secret (the session is a cookie)', () => {
    const path = '/api/v1/guest/collections/01a0ee76-0574-7fe5-a38b-53b07a9b40f9/session';
    expect(redactUrl(path)).toBe(path);
  });

  test('redacts the signature and credential of a presigned part or download URL', () => {
    const out = redactUrl(
      '/stepler/collections/c/uploads/u/original?partNumber=2&uploadId=mp1&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F20261003&X-Amz-Signature=abc123',
    );
    expect(out).not.toMatch(/AKIA|abc123/);
    expect(out).toContain('partNumber=2');
  });
});
