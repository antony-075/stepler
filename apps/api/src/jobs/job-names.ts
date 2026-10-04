/** Every job may carry the id of the request that caused it, so its logs can be correlated. */
export interface JobMeta {
  requestId?: string;
}

interface JobPayloads {
  'storage.discard-upload': { uploadSessionId: string };
  'content.purge': { contentItemId: string };
  'collection.purge': { collectionId: string };
  'uploads.expire': Record<never, never>;
  'maintenance.sweep': Record<never, never>;
  'media.image-derivatives': { contentItemId: string };
  'media.video-poster': { contentItemId: string };
}

/** Job payloads by queue name (ADR 0009). Payloads hold ids only, never user content. */
export type JobData = { [N in keyof JobPayloads]: JobPayloads[N] & JobMeta };
export type JobName = keyof JobData;

export interface JobOptions {
  retryLimit: number;
  /** Seconds before the first retry; doubled on each further retry (`retryBackoff`). */
  retryDelay: number;
  retryBackoff: true;
  /** Seconds a job may stay active before pg-boss treats it as failed. */
  expireInSeconds: number;
}

const MEDIA: JobOptions = {
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 600,
};
const PURGE: JobOptions = {
  retryLimit: 10,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 900,
};
const PERIODIC: JobOptions = {
  retryLimit: 2,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 600,
};

/** Retry and expiry per queue; applied when the queues are created at boot. */
export const JOB_OPTIONS = {
  'storage.discard-upload': PURGE,
  'content.purge': PURGE,
  'collection.purge': PURGE,
  'uploads.expire': PERIODIC,
  'maintenance.sweep': PERIODIC,
  'media.image-derivatives': MEDIA,
  'media.video-poster': MEDIA,
} as const satisfies Record<JobName, JobOptions>;

export const JOB_NAMES = Object.keys(JOB_OPTIONS) as JobName[];

const ENTITY_KEY: { [N in JobName]: (data: JobData[N]) => string | null } = {
  'storage.discard-upload': (data) => data.uploadSessionId,
  'content.purge': (data) => data.contentItemId,
  'collection.purge': (data) => data.collectionId,
  'uploads.expire': () => null,
  'maintenance.sweep': () => null,
  'media.image-derivatives': (data) => data.contentItemId,
  'media.video-poster': (data) => data.contentItemId,
};

/**
 * The default singleton key: one queued, retrying or active job per entity (queues use the
 * `exclusive` policy, spike S7). Every job needs one: keyless jobs of a queue would all share
 * the key `''` and dedupe each other away. Periodic jobs use the queue name.
 */
export function singletonKeyFor<N extends JobName>(name: N, data: JobData[N]): string {
  const entity = ENTITY_KEY[name](data);
  return entity === null ? name : `${name}:${entity}`;
}
