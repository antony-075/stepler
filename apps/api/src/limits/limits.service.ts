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
  storageBytes: bigint;
}

export interface CollectionLimits {
  storageBytes: bigint;
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

  forCollection(_collection: { id: string }): CollectionLimits {
    return { storageBytes: this.env.LIMIT_STORAGE_BYTES_PER_COLLECTION };
  }

  forUser(_user: { id: string }): UserLimits {
    return {
      activeCollections: this.env.LIMIT_ACTIVE_COLLECTIONS_PER_ACCOUNT,
      storageBytes: this.env.LIMIT_STORAGE_BYTES_PER_ACCOUNT,
    };
  }
}
