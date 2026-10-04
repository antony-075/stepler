import { Inject, Injectable } from '@nestjs/common';
import { WORKER_ENV } from '../job-handler.js';
import type { WorkerEnv } from '../worker-env.js';

/**
 * One process-wide limit for media work (sharp, libheif, ffmpeg), shared by every media job type:
 * pg-boss's `localConcurrency` is per queue, so image and video jobs would otherwise run side by
 * side. `WORKER_MEDIA_CONCURRENCY` is the total (spike S5: 512 MB holds one at a time).
 */
@Injectable()
export class MediaSlots {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly limit: number;

  constructor(@Inject(WORKER_ENV) env: Pick<WorkerEnv, 'WORKER_MEDIA_CONCURRENCY'>) {
    this.limit = env.WORKER_MEDIA_CONCURRENCY;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await work();
    } finally {
      // Hand the slot straight to the next waiter (the count stays), or free it.
      const next = this.waiting.shift();
      if (next === undefined) this.active -= 1;
      else next();
    }
  }
}
