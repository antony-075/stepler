import { describe, expect, test } from 'vitest';
import { JOB_NAMES, JOB_OPTIONS, type JobName, singletonKeyFor } from './job-names.js';

describe('job names', () => {
  test('JOB_OPTIONS covers every job name', () => {
    const expected: Record<JobName, true> = {
      'storage.discard-upload': true,
      'content.purge': true,
      'collection.purge': true,
      'uploads.expire': true,
      'maintenance.sweep': true,
      'media.image-derivatives': true,
      'media.video-poster': true,
      'media.collection-image': true,
      'collection-image.purge': true,
      'mail.report-received': true,
      'mail.report-decision': true,
      'mail.appeal-received': true,
      'billing.retention': true,
      'mail.billing-read-only': true,
      'mail.billing-deletion-warning': true,
    };
    expect([...JOB_NAMES].sort()).toEqual(Object.keys(expected).sort());
    for (const name of JOB_NAMES) expect(JOB_OPTIONS[name].retryLimit).toBeGreaterThan(0);
  });

  test('singleton keys are per entity, or the queue name for periodic jobs', () => {
    expect(singletonKeyFor('content.purge', { contentItemId: 'a', requestId: 'r1' })).toBe(
      'content.purge:a',
    );
    expect(singletonKeyFor('collection.purge', { collectionId: 'c' })).toBe('collection.purge:c');
    expect(singletonKeyFor('storage.discard-upload', { uploadSessionId: 'u' })).toBe(
      'storage.discard-upload:u',
    );
    expect(singletonKeyFor('media.video-poster', { contentItemId: 'v' })).toBe(
      'media.video-poster:v',
    );
    expect(
      singletonKeyFor('collection-image.purge', { collectionId: 'c', imageId: 'k', slot: 'COVER' }),
    ).toBe('collection-image.purge:k');
    expect(singletonKeyFor('media.collection-image', { collectionId: 'c', imageId: 'k' })).toBe(
      'media.collection-image:k',
    );
    // A collection's 30- and 7-day warnings are two jobs, never deduped into one.
    expect(singletonKeyFor('mail.billing-deletion-warning', { collectionId: 'c', days: 7 })).toBe(
      'mail.billing-deletion-warning:c:7',
    );
    expect(singletonKeyFor('billing.retention', {})).toBe('billing.retention');
    expect(singletonKeyFor('mail.report-received', { reportId: 'r' })).toBe(
      'mail.report-received:r',
    );
    expect(singletonKeyFor('mail.report-decision', { reportId: 'r' })).toBe(
      'mail.report-decision:r',
    );
    expect(singletonKeyFor('mail.appeal-received', { appealId: 'p' })).toBe(
      'mail.appeal-received:p',
    );
    expect(singletonKeyFor('maintenance.sweep', {})).toBe('maintenance.sweep');
    expect(singletonKeyFor('uploads.expire', {})).toBe('uploads.expire');
  });
});
