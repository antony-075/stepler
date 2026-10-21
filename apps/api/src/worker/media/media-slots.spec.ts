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

  test('videos leave one slot to images', async () => {
    const slots = new MediaSlots({ WORKER_MEDIA_CONCURRENCY: 3 });
    let videos = 0;
    let peakVideos = 0;
    const finish: (() => void)[] = [];
    const video = () =>
      slots.run(async () => {
        videos += 1;
        peakVideos = Math.max(peakVideos, videos);
        await new Promise<void>((resolve) => finish.push(resolve));
        videos -= 1;
      }, 'video');
    const running = [video(), video(), video()];
    await tick();
    expect(peakVideos).toBe(2);
    // The third video waits, and an image behind it still starts in the free slot.
    await expect(slots.run(() => Promise.resolve('photo'))).resolves.toBe('photo');
    for (const done of finish.splice(0)) done();
    await tick();
    for (const done of finish.splice(0)) done();
    await Promise.all(running);
    expect(peakVideos).toBe(2);
  });

  test('with one slot a video still runs', async () => {
    const slots = new MediaSlots({ WORKER_MEDIA_CONCURRENCY: 1 });
    await expect(slots.run(() => Promise.resolve('poster'), 'video')).resolves.toBe('poster');
  });
});
