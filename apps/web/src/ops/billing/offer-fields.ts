import type { OfferKind, OperatorOffer, PackExtensionKind } from '@stepler/contracts';
import { z } from 'zod';
import { formatGbInput, parseGbInput } from './form-units';

/** The limits a kind of offer carries (`BillingOffer_kind_shape` in the database decides). */
export type LimitField =
  | 'activeCollections'
  | 'storage'
  | 'collectionStorage'
  | 'guestLinks'
  | 'windowDays'
  | 'retentionDays'
  | 'durationDays';

export function limitFieldsOf(
  kind: OfferKind,
  extension: PackExtensionKind | null,
): readonly LimitField[] {
  switch (kind) {
    case 'TRIAL':
      return ['activeCollections', 'storage', 'collectionStorage', 'guestLinks', 'durationDays'];
    case 'PACK':
      return ['collectionStorage', 'guestLinks', 'windowDays', 'retentionDays'];
    case 'SUBSCRIPTION':
      return ['activeCollections', 'storage', 'collectionStorage', 'guestLinks'];
    case 'PACK_EXTENSION':
      return extension === 'WINDOW'
        ? ['windowDays']
        : extension === 'RETENTION'
          ? ['retentionDays']
          : [];
  }
}

/** The periods a kind is sold in; a storage upgrade and the trial have no price of their own. */
export function priceIntervalsOf(
  kind: OfferKind,
  extension: PackExtensionKind | null,
): readonly ('ONE_TIME' | 'MONTH' | 'YEAR')[] {
  if (kind === 'TRIAL' || extension === 'STORAGE') return [];
  return kind === 'SUBSCRIPTION' ? ['MONTH', 'YEAR'] : ['ONE_TIME'];
}

const count = z.string().regex(/^(\d{1,6})?$/);
const gb = z.string().refine((value) => value.trim() === '' || parseGbInput(value) !== null);

/** The editor's form: everything as typed text, converted on submit (`toOfferBody`). */
export const offerFormSchema = z.object({
  code: z.string(),
  kind: z.enum(['PACK', 'PACK_EXTENSION', 'SUBSCRIPTION']),
  extension: z.enum(['WINDOW', 'RETENTION', 'STORAGE']),
  titleUk: z.string().trim().min(1).max(80),
  titleEn: z.string().trim().min(1).max(80),
  descriptionUk: z.string().trim().max(500),
  descriptionEn: z.string().trim().max(500),
  rank: z.string().regex(/^\d{1,4}$/),
  highlighted: z.boolean(),
  activeCollections: count,
  storage: gb,
  collectionStorage: gb,
  guestLinks: count,
  windowDays: count,
  retentionDays: count,
  durationDays: count,
  rroItemId: z.string().trim().max(64),
});
export type OfferFormValues = z.infer<typeof offerFormSchema>;

/** A new offer's code, as the contract and the database accept it. */
export const OFFER_CODE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export function formValuesOf(offer: OperatorOffer | null): OfferFormValues {
  const n = (value: number | null) => (value === null ? '' : String(value));
  return {
    code: offer?.code ?? '',
    kind: offer === null || offer.kind === 'TRIAL' ? 'PACK' : offer.kind,
    extension: offer?.extension ?? 'WINDOW',
    titleUk: offer?.titleUk ?? '',
    titleEn: offer?.titleEn ?? '',
    descriptionUk: offer?.descriptionUk ?? '',
    descriptionEn: offer?.descriptionEn ?? '',
    rank: String(offer?.rank ?? 0),
    highlighted: offer?.highlighted ?? false,
    activeCollections: n(offer?.limits.activeCollections ?? null),
    storage: formatGbInput(offer?.limits.storageBytes ?? null),
    collectionStorage: formatGbInput(offer?.limits.collectionStorageBytes ?? null),
    guestLinks: n(offer?.limits.guestLinks ?? null),
    windowDays: n(offer?.limits.windowDays ?? null),
    retentionDays: n(offer?.limits.retentionDays ?? null),
    durationDays: n(offer?.durationDays ?? null),
    rroItemId: offer?.rroItemId ?? '',
  };
}

/** The contract body (without the reason): fields the kind does not carry are sent as `null`. */
export function toOfferBody(values: OfferFormValues, fields: readonly LimitField[]) {
  const has = (field: LimitField) => fields.includes(field);
  const int = (field: LimitField, text: string) =>
    has(field) && text.trim() !== '' ? Number(text) : null;
  const bytes = (field: LimitField, text: string) =>
    has(field) && text.trim() !== '' ? parseGbInput(text) : null;
  const text = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    titleUk: values.titleUk.trim(),
    titleEn: values.titleEn.trim(),
    descriptionUk: text(values.descriptionUk),
    descriptionEn: text(values.descriptionEn),
    rank: Number(values.rank),
    highlighted: values.highlighted,
    activeCollections: int('activeCollections', values.activeCollections),
    storageBytes: bytes('storage', values.storage),
    collectionStorageBytes: bytes('collectionStorage', values.collectionStorage),
    guestLinks: int('guestLinks', values.guestLinks),
    windowDays: int('windowDays', values.windowDays),
    retentionDays: int('retentionDays', values.retentionDays),
    durationDays: int('durationDays', values.durationDays),
    rroItemId: text(values.rroItemId),
  };
}
