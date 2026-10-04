import { describe, expect, test } from 'vitest';
import { MediaSlots } from './media-slots.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('MediaSlots', () => {
  test('never runs more than the limit at once, across callers', async () => {
    const slots = new MediaSlots({ WORKER_MEDIA_CONCURRENCY: 1 });
    let running = 0;
    let peak = 0;
    const job = () =>
      slots.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await tick();
        running -= 1;
      });
    await Promise.all([job(), job(), job()]);
    expect(peak).toBe(1);
  });

  test('a failing job frees its slot', async () => {
    const slots = new MediaSlots({ WORKER_MEDIA_CONCURRENCY: 1 });
    await expect(slots.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(slots.run(() => Promise.resolve('next'))).resolves.toBe('next');
  });

  test('runs up to the limit side by side', async () => {
    const slots = new MediaSlots({ WORKER_MEDIA_CONCURRENCY: 2 });
    let running = 0;
    let peak = 0;
    const job = () =>
      slots.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await tick();
        running -= 1;
      });
    await Promise.all([job(), job(), job(), job()]);
    expect(peak).toBe(2);
  });
});
