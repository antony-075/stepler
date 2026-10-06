import { describe, expect, test } from 'vitest';
import { ApiError } from '@/api/client';
import { reportErrorMessage, toReportRequest } from './report-content';

describe('the guest report form', () => {
  test('empty fields are left out; the language always goes', () => {
    expect(toReportRequest({ reason: 'SPAM', description: '  ', email: '' }, 'uk')).toEqual({
      reason: 'SPAM',
      locale: 'uk',
    });
    expect(
      toReportRequest(
        { reason: 'PRIVACY', description: ' Це я ', email: ' olena@example.com ' },
        'en',
      ),
    ).toEqual({
      reason: 'PRIVACY',
      description: 'Це я',
      email: 'olena@example.com',
      locale: 'en',
    });
  });

  test('errors: too many, gone, anything else', () => {
    expect(reportErrorMessage(new ApiError('RATE_LIMITED', 429))).toBe('rateLimited');
    expect(reportErrorMessage(new ApiError('NOT_FOUND', 404))).toBe('gone');
    expect(reportErrorMessage(new ApiError('FORBIDDEN', 403))).toBe('failed');
    expect(reportErrorMessage(new Error('network'))).toBe('failed');
  });
});
