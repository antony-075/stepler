import type { JobData, JobName } from '../jobs/job-names.js';

/** Injection token for the validated `WorkerEnv`. */
export const WORKER_ENV = Symbol('WORKER_ENV');

/**
 * Runs one job. Handlers are idempotent: a missing row or object counts as done, and a rerun
 * after a failure continues from what is left. Throwing makes pg-boss retry (`JOB_OPTIONS`).
 */
export interface JobHandler<N extends JobName = JobName> {
  readonly name: N;
  handle(data: JobData[N]): Promise<void>;
  /** Called once the last retry has failed (media jobs: the item becomes `FAILED`). */
  onFinalFailure?(data: JobData[N]): Promise<void>;
}
