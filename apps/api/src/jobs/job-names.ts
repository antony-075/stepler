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
  /** An admin image's renditions for its slot, from its copied original (plan Task 8). */
  'media.collection-image': { collectionId: string; imageId: string };
  /** The objects of an image no version or collection references (its prefix), unless it lives. */
  'collection-image.purge': {
    collectionId: string;
    imageId: string;
    slot: 'COVER' | 'BACKGROUND' | 'COLLECTION_IMAGE';
  };
  /** Slice 9 [P1]: the operator's «нова скарга» mail, sent once per report (`operatorNotifiedAt`). */
  'mail.report-received': { reportId: string };
  /** The reporter's decision mail, if they left an address (`reporterNotifiedAt`). */
  'mail.report-decision': { reportId: string };
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
/**
 * Videos (up to 2 GB): location stripping downloads the original and uploads it back
 * (`MIN_TRANSFER_BYTES_PER_SECOND` allows ≈ 200 s each way) before the poster.
 */
const MEDIA_VIDEO: JobOptions = { ...MEDIA, expireInSeconds: 1800 };
const PURGE: JobOptions = {
  retryLimit: 10,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 900,
};
/** Mail (slice 9): an SMTP outage retries for about four hours (60 s doubling, 8 times). */
const MAIL: JobOptions = {
  retryLimit: 8,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 120,
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
  'media.video-poster': MEDIA_VIDEO,
  'media.collection-image': MEDIA,
  'collection-image.purge': PURGE,
  'mail.report-received': MAIL,
  'mail.report-decision': MAIL,
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
  'media.collection-image': (data) => data.imageId,
  'collection-image.purge': (data) => data.imageId,
  'mail.report-received': (data) => data.reportId,
  'mail.report-decision': (data) => data.reportId,
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

/**
 * How long a deleted collection's purge waits (spec §10.5): upload URLs issued just before the
 * deletion stay valid for their TTL, and a part PUT that started in time may finish later (even
 * after its upload is aborted), so the purge lists the prefix only after the TTL plus an hour.
 */
export function collectionPurgeDelaySeconds(uploadUrlTtlSeconds: number): number {
  return uploadUrlTtlSeconds + 3600;
}
