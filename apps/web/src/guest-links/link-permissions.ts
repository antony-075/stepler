import { canContribute, type GuestLinkPermissions } from '@stepler/contracts';

/**
 * The permission editor's form: what guests may add (photos, videos, documents and wishes, each
 * on its own, owner 2026-10-02) and whose content they see (everyone's or only their own).
 * `canDeleteOwn` is not asked: every link that can contribute keeps it on (G3) until slice 8
 * builds the guest's delete.
 */
export type PermissionForm = {
  photos: boolean;
  videos: boolean;
  documents: boolean;
  texts: boolean;
  seeAll: boolean;
};

export function toPermissions(form: PermissionForm): GuestLinkPermissions {
  const permissions = {
    canUploadPhotos: form.photos,
    canUploadVideos: form.videos,
    canUploadDocuments: form.documents,
    canSubmitText: form.texts,
    canViewGallery: form.seeAll,
  };
  return { ...permissions, canDeleteOwn: canContribute(permissions) };
}

export function fromPermissions(p: GuestLinkPermissions): PermissionForm {
  return {
    photos: p.canUploadPhotos,
    videos: p.canUploadVideos,
    documents: p.canUploadDocuments,
    texts: p.canSubmitText,
    seeAll: p.canViewGallery,
  };
}

/** Guests can add nothing (a view-only link, or, with «only their own», a useless one). */
export const addsNothing = (form: PermissionForm): boolean =>
  !form.photos && !form.videos && !form.documents && !form.texts;

/** Nothing to add and only one's own content to see would leave guests nothing to do. */
export const isValidForm = (form: PermissionForm): boolean => !addsNothing(form) || form.seeAll;

/** Keys under `guestLinks.summary` in the catalogs. */
export type SummaryKey =
  'photos' | 'videos' | 'documents' | 'texts' | 'viewOnly' | 'seeOwn' | 'seeAll';
export type SummaryT = (key: SummaryKey) => string;

/** The separator of the compact summary (owner 2026-10-03: «Фото · Відео · Побажання»). */
export const SUMMARY_SEPARATOR = ' · ';

/**
 * A link's permissions in a few words, for every place that sums a link up (owner 2026-10-03):
 * `add` lists what guests may add («Фото · Відео · Документи · Побажання», or «Лише перегляд»),
 * `see` whose content they see («Бачать лише своє» / «Бачать усе»), shown after it, muted.
 */
export function permissionSummary(
  p: GuestLinkPermissions,
  t: SummaryT,
): { add: string; see: string } {
  const items = [
    ...(p.canUploadPhotos ? [t('photos')] : []),
    ...(p.canUploadVideos ? [t('videos')] : []),
    ...(p.canUploadDocuments ? [t('documents')] : []),
    ...(p.canSubmitText ? [t('texts')] : []),
  ];
  return {
    add: items.length === 0 ? t('viewOnly') : items.join(SUMMARY_SEPARATOR),
    see: p.canViewGallery ? t('seeAll') : t('seeOwn'),
  };
}

/** The whole summary as one line of text («Лише перегляд · Бачать усе»). */
export function permissionSummaryText(p: GuestLinkPermissions, t: SummaryT): string {
  const { add, see } = permissionSummary(p, t);
  return `${add}${SUMMARY_SEPARATOR}${see}`;
}
