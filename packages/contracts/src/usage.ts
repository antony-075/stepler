import { z } from 'zod';
import { accessSchema } from './access.js';

const bytes = z.number().int().min(0);

/**
 * Stored bytes against the limit (ADR 0010): non-deleted files, originals and derivatives, plus
 * open uploads, which reserve their declared size.
 */
export const storageUsageSchema = z.object({ usedBytes: bytes, limitBytes: bytes }).strict();
export type StorageUsage = z.infer<typeof storageUsageSchema>;

/**
 * `GET /api/v1/me/usage`: the account's usage and access (ADR 0018), for the dashboard and the
 * banners. Limits and usage cover the account's own collections, not pack collections.
 */
export const usageResponseSchema = z
  .object({
    activeCollections: z
      .object({ used: z.number().int().min(0), limit: z.number().int().min(0) })
      .strict(),
    storage: storageUsageSchema,
    access: accessSchema,
  })
  .strict();
export type UsageResponse = z.infer<typeof usageResponseSchema>;
