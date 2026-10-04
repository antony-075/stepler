import { z } from 'zod';
import { parseEnv, positiveInt, sharedEnvShape } from '../config/env.js';

/**
 * The worker's environment: database, storage and its own tuning. No SMTP, Turnstile or
 * APP_SECRET: the worker sends no mail and handles no tokens.
 */
const workerEnvSchema = z.object({
  ...sharedEnvShape,
  /** Media jobs run at once in one worker (sharp/ffmpeg memory, spike S5). */
  WORKER_MEDIA_CONCURRENCY: positiveInt(1),
  /** Objects deleted per storage call and rows per sweep step (S3 allows ≤ 1000 per call). */
  WORKER_PURGE_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(500),
  /** Guest sessions idle this long with no content are deleted (the cookie's Max-Age is 400 days). */
  GUEST_SESSION_IDLE_DAYS: positiveInt(400),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function loadWorkerEnv(source: Record<string, string | undefined>): WorkerEnv {
  return parseEnv(workerEnvSchema, source);
}
