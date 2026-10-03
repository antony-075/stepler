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
    expect(singletonKeyFor('maintenance.sweep', {})).toBe('maintenance.sweep');
    expect(singletonKeyFor('uploads.expire', {})).toBe('uploads.expire');
  });
});
