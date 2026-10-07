import { z } from 'zod';

/**
 * Access states (ADR 0018, plan [P2]). With the other entitlement shapes that existing responses
 * embed (usage, collection, guest context), in their own file so those can import them without
 * a cycle through `billing.ts`.
 *
 * - `ACTIVE`: everything allowed.
 * - `GRACE`: a renewal failed; everything allowed while the provider retries.
 * - `COLLECTING_CLOSED`: a pack collection after its collection window; guests only view.
 * - `READ_ONLY`: the paid time ended; view, download, delete and billing only.
 */
export const accessStateSchema = z.enum(['ACTIVE', 'GRACE', 'COLLECTING_CLOSED', 'READ_ONLY']);
export type AccessState = z.infer<typeof accessStateSchema>;

/** Which source decided the state, so the web can word it. */
export const accessReasonSchema = z.enum([
  'TRIAL',
  'TRIAL_ENDED',
  'SUBSCRIPTION',
  'SUBSCRIPTION_PAST_DUE',
  'SUBSCRIPTION_ENDED',
  'COMPLIMENTARY',
  'PACK',
  'PACK_WINDOW_ENDED',
  'PACK_RETENTION_ENDED',
  'NONE',
]);
export type AccessReason = z.infer<typeof accessReasonSchema>;

/**
 * An account's or a collection's access. `endsAt` = when the current state's source ends (the
 * trial's end, the paid period's end, the pack's window or retention end); `null` = open-ended
 * or already ended.
 */
export const accessSchema = z
  .object({
    state: accessStateSchema,
    reason: accessReasonSchema,
    endsAt: z.iso.datetime().nullable(),
  })
  .strict();
export type Access = z.infer<typeof accessSchema>;

/** Whether a collection takes the account's plan or has its own pack [P1]. */
export const collectionEntitlementSchema = z.enum(['ACCOUNT', 'PACK']);
export type CollectionEntitlement = z.infer<typeof collectionEntitlementSchema>;

/** A pack collection's own clocks [P4]. */
export const collectionPackSchema = z
  .object({
    offerTitle: z.string(),
    storageBytes: z.int().min(0),
    windowEndsAt: z.iso.datetime(),
    retentionEndsAt: z.iso.datetime(),
  })
  .strict();
export type CollectionPack = z.infer<typeof collectionPackSchema>;

/** What the guest page offers: `OPEN` = the link's own permissions apply [P2]. */
export const guestContributionSchema = z.enum(['OPEN', 'COLLECTING_CLOSED', 'READ_ONLY']);
export type GuestContribution = z.infer<typeof guestContributionSchema>;
