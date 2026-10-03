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
