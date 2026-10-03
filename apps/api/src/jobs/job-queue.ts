import type { Prisma } from '../generated/prisma/client.js';
import type { JobData, JobName } from './job-names.js';

/** Injection token for the `JobQueue` port. */
export const JOB_QUEUE = Symbol('JOB_QUEUE');

export interface EnqueueOptions {
  /** Defaults to the per-entity key (`singletonKeyFor`). */
  singletonKey?: string;
  startAfterSeconds?: number;
}

/**
 * Background jobs (ADR 0009). `enqueue` writes the job through the caller's transaction, so the
 * job exists if and only if the state change that needs it commits (spike S7). A job with the
 * same singleton key that is already queued, retrying or running makes this a no-op.
 */
export interface JobQueue {
  enqueue<N extends JobName>(
    tx: Prisma.TransactionClient,
    name: N,
    data: JobData[N],
    options?: EnqueueOptions,
  ): Promise<void>;
}
