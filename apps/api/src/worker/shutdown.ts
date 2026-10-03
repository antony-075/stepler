import type { INestApplicationContext } from '@nestjs/common';
import { PgBossClient } from '../jobs/pg-boss-queue.js';

/**
 * Running jobs get this long to finish; pg-boss then fails what is still running, so it is
 * retried. Render waits `maxShutdownDelaySeconds` (render.yaml) after SIGTERM.
 */
export const JOB_DRAIN_TIMEOUT_MS = 25_000;

/**
 * Stops the worker in the right order: pg-boss first (no new fetches, running jobs drain while
 * Prisma and S3 are still open), then the Nest context, whose destroy hooks close those clients.
 * Nest's own shutdown hooks would close the clients before any `beforeApplicationShutdown`.
 */
export async function shutdownWorker(
  app: INestApplicationContext,
  drainTimeoutMs = JOB_DRAIN_TIMEOUT_MS,
): Promise<void> {
  await app.get(PgBossClient).stop(true, drainTimeoutMs);
  await app.close();
}
