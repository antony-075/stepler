import { Inject, Injectable } from '@nestjs/common';
import type { AccessResult } from '../billing/domain/access.js';
import { EntitlementResolver } from '../billing/entitlement-resolver.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface MagicLinkLimits {
  perEmailPerHour: number;
  perIpPerHour: number;
  previewPerIpPerHour: number;
}

/**
 * The account's entitlement (ADR 0018): its trial, plan or grant, or the one that ended (whose
 * limits still describe what the account had). Bounds `ACCOUNT` collections only; a pack
 * collection has its own (`CollectionLimits`). No source at all = zero.
 */
export interface UserLimits {
  activeCollections: number;
  /** Creations per rolling 24 hours; deleting a collection does not give one back (abuse, env). */
  collectionCreationsPerDay: number;
  storageBytes: bigint;
  access: AccessResult;
}

export interface CollectionLimits {
  storageBytes: bigint;
  /** Non-revoked additional guest links; the default link does not count [G8]. */
  guestLinks: number;
  /** `PACK` = counted against its pack only, not the account [P1]. */
  entitlement: 'ACCOUNT' | 'PACK';
  ownerId: string;
  access: AccessResult;
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
 * Single source of limits (ADR 0010). What an account or collection may hold comes from its
 * entitlement (ADR 0018, `forUser` / `forCollection`); abuse and rate limits stay in config.
 */
@Injectable()
export class LimitsService {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly entitlements: EntitlementResolver,
  ) {}

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

  /** LiqPay callbacks per client IP per minute (ADR 0018): load, not authentication. */
  billingCallbacksPerIpPerMinute(): number {
    return this.env.LIMIT_BILLING_CALLBACKS_PER_IP_PER_MINUTE;
  }

  /** Checkouts per signed-in account per hour. */
  billingCheckoutsPerUserPerHour(): number {
    return this.env.LIMIT_BILLING_CHECKOUTS_PER_USER_PER_HOUR;
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

  /** Pass the transaction that holds the owner's lock, so the limit and the usage agree. */
  async forCollection(
    collectionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CollectionLimits> {
    const access = await this.entitlements.forCollection(collectionId, tx);
    return {
      storageBytes: access.limits.collectionStorageBytes ?? 0n,
      guestLinks: access.limits.guestLinks ?? 0,
      entitlement: access.collection.entitlement,
      ownerId: access.collection.ownerId,
      access,
    };
  }

  async forUser(userId: string, tx?: Prisma.TransactionClient): Promise<UserLimits> {
    const access = await this.entitlements.forAccount(userId, tx);
    return {
      activeCollections: access.limits.activeCollections ?? 0,
      collectionCreationsPerDay: this.env.LIMIT_COLLECTION_CREATIONS_PER_DAY,
      storageBytes: access.limits.storageBytes ?? 0n,
      access,
    };
  }
}
