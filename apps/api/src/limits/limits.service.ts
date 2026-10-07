import { Inject, Injectable } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';

export interface MagicLinkLimits {
  perEmailPerHour: number;
  perIpPerHour: number;
  previewPerIpPerHour: number;
}

export interface UserLimits {
  activeCollections: number;
  /** Creations per rolling 24 hours; deleting a collection does not give one back. */
  collectionCreationsPerDay: number;
  storageBytes: bigint;
}

export interface CollectionLimits {
  storageBytes: bigint;
  /** Non-revoked additional guest links; the default link does not count [G8]. */
  guestLinks: number;
}

/** Per-file maxima by kind and the files a guest may pick at once (D2). */
export interface FileRules {
  fileBytes: Record<'PHOTO' | 'VIDEO' | 'DOCUMENT', bigint>;
  /** Enforced by the guest page; the server limits concurrency instead. */
  filesPerBatch: number;
}

/** Per guest session (spec §13.1, F1); a session is one browser in one collection. */
export interface GuestSessionLimits {
  textsPerHour: number;
  uploadInitiationsPerHour: number;
  concurrentUploads: number;
  /** Reports one session may send per rolling hour (slice 9). */
  reportsPerHour: number;
}

/** The direct-upload protocol's sizes and lifetimes (spec §10.2, §10.6). */
export interface UploadSettings {
  partSizeBytes: bigint;
  sessionTtlHours: number;
  urlTtlSeconds: number;
  mediaUrlWindowSeconds: number;
}

/**
 * Single source of limits. Values are config-backed today; plans and entitlements plug in
 * behind `forUser` later without changing callers (ADR 0010).
 */
@Injectable()
export class LimitsService {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  magicLink(): MagicLinkLimits {
    return {
      perEmailPerHour: this.env.LIMIT_MAGIC_LINK_PER_EMAIL_PER_HOUR,
      perIpPerHour: this.env.LIMIT_MAGIC_LINK_PER_IP_PER_HOUR,
      previewPerIpPerHour: this.env.LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR,
    };
  }

  /** Public guest link resolution per client IP per minute [G10]. */
  guestLinkResolvePerIpPerMinute(): number {
    return this.env.LIMIT_GUEST_LINK_RESOLVE_PER_IP_PER_MINUTE;
  }

  /** Guest session exchanges per client IP per minute; venue NAT shares an IP, as [G10]. */
  guestSessionCreatePerIpPerMinute(): number {
    return this.env.LIMIT_GUEST_SESSIONS_PER_IP_PER_MINUTE;
  }

  forGuestSession(): GuestSessionLimits {
    return {
      textsPerHour: this.env.LIMIT_TEXTS_PER_GUEST_SESSION_PER_HOUR,
      uploadInitiationsPerHour: this.env.LIMIT_UPLOAD_INITIATIONS_PER_GUEST_SESSION_PER_HOUR,
      concurrentUploads: this.env.LIMIT_CONCURRENT_UPLOADS_PER_GUEST_SESSION,
      reportsPerHour: this.env.LIMIT_REPORTS_PER_GUEST_SESSION_PER_HOUR,
    };
  }

  /**
   * Guest texts per client IP per minute, across sessions: a new session costs one call, so the
   * per-session limit alone would not bound one client.
   */
  guestTextCreatePerIpPerMinute(): number {
    return this.env.LIMIT_TEXTS_PER_IP_PER_MINUTE;
  }

  /** Guest reads per client IP per minute and route; generous, a bound on load. */
  guestReadsPerIpPerMinute(): number {
    return this.env.LIMIT_GUEST_READS_PER_IP_PER_MINUTE;
  }

  /** Slice 9b: appeals per admin per rolling day, and the quarantine before an operator purge. */
  moderation(): { appealsPerDay: number; quarantineDays: number } {
    return {
      appealsPerDay: this.env.LIMIT_APPEALS_PER_ACCOUNT_PER_DAY,
      quarantineDays: this.env.MODERATION_QUARANTINE_DAYS,
    };
  }

  /** Guest reports per client IP per hour, across sessions (slice 9). */
  reportsPerIpPerHour(): number {
    return this.env.LIMIT_REPORTS_PER_IP_PER_HOUR;
  }

  /** Guest deletes of their own frames per client IP per minute and route [C15]. */
  guestWritesPerIpPerMinute(): number {
    return this.env.LIMIT_GUEST_WRITES_PER_IP_PER_MINUTE;
  }

  /** Upload API calls per client IP per minute, per route (venue NAT shares an IP). */
  uploadCallsPerIpPerMinute(): number {
    return this.env.LIMIT_UPLOAD_CALLS_PER_IP_PER_MINUTE;
  }

  /** Upload API calls per guest session per minute, per route. */
  uploadCallsPerGuestSessionPerMinute(): number {
    return this.env.LIMIT_UPLOAD_CALLS_PER_GUEST_SESSION_PER_MINUTE;
  }

  /** Admin cover calls (upload, from-frame, remove) per client IP per minute, per route. */
  coverCallsPerIpPerMinute(): number {
    return this.env.LIMIT_ADMIN_COVER_CALLS_PER_IP_PER_MINUTE;
  }

  /** The same per signed-in user. */
  coverCallsPerUserPerMinute(): number {
    return this.env.LIMIT_ADMIN_COVER_CALLS_PER_USER_PER_MINUTE;
  }

  fileRules(): FileRules {
    return {
      fileBytes: {
        PHOTO: this.env.LIMIT_FILE_BYTES_PHOTO,
        VIDEO: this.env.LIMIT_FILE_BYTES_VIDEO,
        DOCUMENT: this.env.LIMIT_FILE_BYTES_DOCUMENT,
      },
      filesPerBatch: this.env.LIMIT_FILES_PER_BATCH,
    };
  }

  uploads(): UploadSettings {
    return {
      partSizeBytes: this.env.UPLOAD_PART_SIZE_BYTES,
      sessionTtlHours: this.env.UPLOAD_SESSION_TTL_HOURS,
      urlTtlSeconds: this.env.UPLOAD_URL_TTL_SECONDS,
      mediaUrlWindowSeconds: this.env.MEDIA_URL_WINDOW_SECONDS,
    };
  }

  forCollection(_collection: { id: string }): CollectionLimits {
    return {
      storageBytes: this.env.LIMIT_STORAGE_BYTES_PER_COLLECTION,
      guestLinks: this.env.LIMIT_GUEST_LINKS_PER_COLLECTION,
    };
  }

  forUser(_user: { id: string }): UserLimits {
    return {
      activeCollections: this.env.LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT,
      collectionCreationsPerDay: this.env.LIMIT_COLLECTION_CREATIONS_PER_DAY,
      storageBytes: this.env.LIMIT_STORAGE_BYTES_PER_ACCOUNT,
    };
  }
}
