import { guestLinkPermissionsSchema } from '@stepler/contracts';
import { describe, expect, it } from 'vitest';
import uk from '../../messages/uk.json';
import {
  allowedWords,
  fromPermissions,
  isValidForm,
  type PermissionForm,
  type PermissionWordKey,
  permissionWords,
  toPermissions,
} from './link-permissions';

const words = uk.guestLinks.permissions;
const t = (key: PermissionWordKey, values?: { list: string }) =>
  words[key].replace('{list}', values?.list ?? '');

const VALID_FORMS: PermissionForm[] = [
  { uploads: true, texts: true, seeAll: true },
  { uploads: true, texts: true, seeAll: false },
  { uploads: true, texts: false, seeAll: true },
  { uploads: true, texts: false, seeAll: false },
  { uploads: false, texts: true, seeAll: true },
  { uploads: false, texts: true, seeAll: false },
  { uploads: false, texts: false, seeAll: true },
];

describe('toPermissions', () => {
  it('makes a view-only link without delete-own', () => {
    expect(toPermissions({ uploads: false, texts: false, seeAll: true })).toEqual({
      canUploadFiles: false,
      canSubmitText: false,
      canViewGallery: true,
      canDeleteOwn: false,
    });
  });

  it('lets contributors delete their own content (G3)', () => {
    expect(toPermissions({ uploads: true, texts: false, seeAll: false })).toEqual({
      canUploadFiles: true,
      canSubmitText: false,
      canViewGallery: false,
      canDeleteOwn: true,
    });
  });

  it('produces permissions the contract accepts, and round-trips, for every valid form', () => {
    for (const form of VALID_FORMS) {
      const permissions = toPermissions(form);
      expect(guestLinkPermissionsSchema.safeParse(permissions).success).toBe(true);
      expect(fromPermissions(permissions)).toEqual(form);
    }
  });
});

describe('isValidForm', () => {
  it('rejects a link that allows nothing', () => {
    expect(isValidForm({ uploads: false, texts: false, seeAll: false })).toBe(false);
    for (const form of VALID_FORMS) expect(isValidForm(form)).toBe(true);
  });
});

describe('permissionWords', () => {
  it('says «Лише перегляд» for a view-only link', () => {
    expect(permissionWords(toPermissions({ uploads: false, texts: false, seeAll: true }), t)).toBe(
      'Лише перегляд',
    );
  });

  it('lists what guests can do', () => {
    expect(permissionWords(toPermissions({ uploads: true, texts: true, seeAll: false }), t)).toBe(
      'Гості можуть: додавати фото й відео, писати побажання, бачити лише свої кадри',
    );
  });
});

describe('allowedWords', () => {
  it('names only what the organiser allowed', () => {
    expect(allowedWords(toPermissions({ uploads: true, texts: true, seeAll: false }), t)).toBe(
      'Організатор дозволив: додавати фото й відео, писати побажання',
    );
    expect(allowedWords(toPermissions({ uploads: false, texts: false, seeAll: true }), t)).toBe(
      'Організатор дозволив: бачити кадри всіх гостей',
    );
  });
});
