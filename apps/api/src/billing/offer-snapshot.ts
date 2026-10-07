import { z } from 'zod';
import type { BillingOffer, Prisma } from '../generated/prisma/client.js';

/**
 * What a payment bought, frozen at checkout [B10]: editing the offer later never changes it. A
 * storage upgrade snapshots the target pack tier with `extension: 'STORAGE'`.
 */
const offerSnapshotSchema = z
  .object({
    code: z.string(),
    kind: z.enum(['TRIAL', 'PACK', 'PACK_EXTENSION', 'SUBSCRIPTION']),
    extension: z.enum(['WINDOW', 'RETENTION', 'STORAGE']).nullable(),
    titleUk: z.string(),
    titleEn: z.string(),
    collectionStorageBytes: z.string().regex(/^\d+$/).nullable(),
    guestLinks: z.int().nullable(),
    windowDays: z.int().nullable(),
    retentionDays: z.int().nullable(),
  })
  .strict();
export type OfferSnapshot = z.infer<typeof offerSnapshotSchema>;

export function snapshotOf(
  offer: BillingOffer,
  extension: OfferSnapshot['extension'] = offer.extension,
): OfferSnapshot {
  return {
    code: offer.code,
    kind: offer.kind,
    extension,
    titleUk: offer.titleUk,
    titleEn: offer.titleEn,
    collectionStorageBytes: offer.collectionStorageBytes?.toString() ?? null,
    guestLinks: offer.guestLinks,
    windowDays: offer.windowDays,
    retentionDays: offer.retentionDays,
  };
}

/** Throws on a row that was not written by `snapshotOf` (a bug, never user input). */
export function readSnapshot(json: Prisma.JsonValue): OfferSnapshot {
  return offerSnapshotSchema.parse(json);
}

export const snapshotTitle = (snapshot: OfferSnapshot, locale: 'uk' | 'en'): string =>
  locale === 'en' ? snapshot.titleEn : snapshot.titleUk;
