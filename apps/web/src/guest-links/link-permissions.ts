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

/** Keys under `guestLinks.permissions` in the catalogs. */
export type PermissionWordKey =
  | 'photos'
  | 'videos'
  | 'documents'
  | 'texts'
  | 'add'
  | 'seeAll'
  | 'ownOnly'
  | 'both'
  | 'viewOnly'
  | 'guestsCan'
  | 'allowed';
export type PermissionWordsT = (key: PermissionWordKey, values?: Record<string, string>) => string;
/** Joins words as a sentence does («фото, відео і побажання»): next-intl `format.list`. */
export type ListFormat = (items: string[]) => string;

/** «додавати фото, відео і побажання», or `null` when guests can add nothing. */
function addClause(p: GuestLinkPermissions, t: PermissionWordsT, list: ListFormat): string | null {
  const items = [
    ...(p.canUploadPhotos ? [t('photos')] : []),
    ...(p.canUploadVideos ? [t('videos')] : []),
    ...(p.canUploadDocuments ? [t('documents')] : []),
    ...(p.canSubmitText ? [t('texts')] : []),
  ];
  return items.length === 0 ? null : t('add', { items: list(items) });
}

/** For the admin: «Гості можуть додавати фото й відео та бачити лише своє» or «Лише перегляд». */
export function permissionWords(
  p: GuestLinkPermissions,
  t: PermissionWordsT,
  list: ListFormat,
): string {
  const add = addClause(p, t, list);
  if (add === null) return t('viewOnly');
  return t('guestsCan', {
    what: t('both', { add, see: p.canViewGallery ? t('seeAll') : t('ownOnly') }),
  });
}

/** For the guest: only what was granted, «Організатор дозволив …». */
export function allowedWords(
  p: GuestLinkPermissions,
  t: PermissionWordsT,
  list: ListFormat,
): string {
  const add = addClause(p, t, list);
  const see = p.canViewGallery ? t('seeAll') : null;
  const what = add !== null && see !== null ? t('both', { add, see }) : (add ?? see ?? '');
  return t('allowed', { what });
}
