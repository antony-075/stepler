import { Inject, Injectable } from '@nestjs/common';
import { WORKER_ENV } from '../job-handler.js';
import type { WorkerEnv } from '../worker-env.js';

/** What a slot is for: videos (posters, location stripping of up to 2 GB) or images. */
export type MediaWork = 'image' | 'video';

interface Waiter {
  work: MediaWork;
  start: () => void;
}

/**
 * One process-wide limit for media work (sharp, libheif, ffmpeg), shared by every media job type:
 * pg-boss's `localConcurrency` is per queue, so image and video jobs would otherwise run side by
 * side. `WORKER_MEDIA_CONCURRENCY` is the total (spike S5: 512 MB holds one at a time).
 *
 * Videos take minutes where a photo takes seconds, so with more than one slot they may hold all
 * but one (launch checklist 4.6): guests' photos keep getting previews while a wedding's videos
 * are processed. With one slot there is nothing to reserve. Waiters start in arrival order, except
 * that a video waiting for the video share does not hold up an image behind it.
 */
@Injectable()
export class MediaSlots {
  private active = 0;
  private activeVideos = 0;
  private readonly waiting: Waiter[] = [];
  private readonly limit: number;
  private readonly videoLimit: number;

  constructor(@Inject(WORKER_ENV) env: Pick<WorkerEnv, 'WORKER_MEDIA_CONCURRENCY'>) {
    this.limit = env.WORKER_MEDIA_CONCURRENCY;
    this.videoLimit = Math.max(1, this.limit - 1);
  }

  async run<T>(work: () => Promise<T>, kind: MediaWork = 'image'): Promise<T> {
    if (this.fits(kind)) this.take(kind);
    else await new Promise<void>((start) => this.waiting.push({ work: kind, start }));
    try {
      return await work();
    } finally {
      this.release(kind);
    }
  }

  private fits(kind: MediaWork): boolean {
    return this.active < this.limit && (kind === 'image' || this.activeVideos < this.videoLimit);
  }

  private take(kind: MediaWork): void {
    this.active += 1;
    if (kind === 'video') this.activeVideos += 1;
  }

  private release(kind: MediaWork): void {
    this.active -= 1;
    if (kind === 'video') this.activeVideos -= 1;
    // Start every waiter that fits now, oldest first.
    for (let index = 0; index < this.waiting.length && this.active < this.limit;) {
      const waiter = this.waiting[index]!;
      if (this.fits(waiter.work)) {
        this.waiting.splice(index, 1);
        this.take(waiter.work);
        waiter.start();
      } else {
        index += 1;
      }
    }
  }
}
