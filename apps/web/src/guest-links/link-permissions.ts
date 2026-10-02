import type { GuestLinkPermissions } from '@stepler/contracts';

/**
 * The permission editor asks two plain questions instead of showing the four flags (plan,
 * "Deliberate choices"): what guests may add (files, wishes) and whose frames they see (everyone's
 * or only their own). `canDeleteOwn` is not asked: every link that can contribute keeps it on
 * (G3) until slice 8 builds the guest's delete.
 */
export type PermissionForm = { uploads: boolean; texts: boolean; seeAll: boolean };

export function toPermissions(form: PermissionForm): GuestLinkPermissions {
  return {
    canUploadFiles: form.uploads,
    canSubmitText: form.texts,
    canViewGallery: form.seeAll,
    canDeleteOwn: form.uploads || form.texts,
  };
}

export function fromPermissions(p: GuestLinkPermissions): PermissionForm {
  return { uploads: p.canUploadFiles, texts: p.canSubmitText, seeAll: p.canViewGallery };
}

/** Nothing to add and only one's own frames to see would leave guests nothing to do. */
export const isValidForm = (form: PermissionForm): boolean =>
  form.uploads || form.texts || form.seeAll;

/** Keys under `guestLinks.permissions` in the catalogs. */
export type PermissionWordKey =
  'uploads' | 'texts' | 'seeAll' | 'ownOnly' | 'viewOnly' | 'guestsCan' | 'allowed';
export type PermissionWordsT = (key: PermissionWordKey, values?: { list: string }) => string;

/** For the admin: «Гості можуть: додавати фото й відео, …» or «Лише перегляд». */
export function permissionWords(p: GuestLinkPermissions, t: PermissionWordsT): string {
  if (!p.canUploadFiles && !p.canSubmitText) return t('viewOnly');
  const clauses = [
    ...(p.canUploadFiles ? [t('uploads')] : []),
    ...(p.canSubmitText ? [t('texts')] : []),
    p.canViewGallery ? t('seeAll') : t('ownOnly'),
  ];
  return t('guestsCan', { list: clauses.join(', ') });
}

/** For the guest: only what was granted, «Організатор дозволив: …». */
export function allowedWords(p: GuestLinkPermissions, t: PermissionWordsT): string {
  const clauses = [
    ...(p.canUploadFiles ? [t('uploads')] : []),
    ...(p.canSubmitText ? [t('texts')] : []),
    ...(p.canViewGallery ? [t('seeAll')] : []),
  ];
  return t('allowed', { list: clauses.join(', ') });
}
