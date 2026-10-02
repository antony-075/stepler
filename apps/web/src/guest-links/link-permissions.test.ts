import { guestLinkPermissionsSchema } from '@stepler/contracts';
import { describe, expect, it } from 'vitest';
import uk from '../../messages/uk.json';
import {
  addsNothing,
  allowedWords,
  fromPermissions,
  isValidForm,
  type PermissionForm,
  type PermissionWordKey,
  permissionWords,
  toPermissions,
} from './link-permissions';

const words = uk.guestLinks.permissions;
const t = (key: PermissionWordKey, values: Record<string, string> = {}) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, value),
    words[key],
  );
const list = (items: string[]) => new Intl.ListFormat('uk', { type: 'conjunction' }).format(items);

const FLAGS = ['photos', 'videos', 'documents', 'texts', 'seeAll'] as const;
/** Every combination of the five answers (32 forms). */
const ALL_FORMS: PermissionForm[] = Array.from({ length: 2 ** FLAGS.length }, (_, bits) =>
  Object.fromEntries(FLAGS.map((flag, i) => [flag, (bits & (1 << i)) !== 0])),
) as PermissionForm[];
const VALID_FORMS = ALL_FORMS.filter(isValidForm);

const form = (on: Partial<PermissionForm>): PermissionForm => ({
  photos: false,
  videos: false,
  documents: false,
  texts: false,
  seeAll: false,
  ...on,
});

describe('toPermissions', () => {
  it('makes a view-only link without delete-own', () => {
    expect(toPermissions(form({ seeAll: true }))).toEqual({
      canUploadPhotos: false,
      canUploadVideos: false,
      canUploadDocuments: false,
      canSubmitText: false,
      canViewGallery: true,
      canDeleteOwn: false,
    });
  });

  it('keeps upload types separate and lets contributors delete their own content (G3)', () => {
    expect(toPermissions(form({ videos: true }))).toEqual({
      canUploadPhotos: false,
      canUploadVideos: true,
      canUploadDocuments: false,
      canSubmitText: false,
      canViewGallery: false,
      canDeleteOwn: true,
    });
  });

  it('produces permissions the contract accepts, and round-trips, for every valid form', () => {
    expect(VALID_FORMS).toHaveLength(31);
    for (const valid of VALID_FORMS) {
      const permissions = toPermissions(valid);
      expect(guestLinkPermissionsSchema.safeParse(permissions).success).toBe(true);
      expect(fromPermissions(permissions)).toEqual(valid);
    }
  });
});

describe('isValidForm and addsNothing', () => {
  it('rejects only the link that allows nothing at all', () => {
    expect(ALL_FORMS.filter((f) => !isValidForm(f))).toEqual([form({})]);
  });

  it('flags a link where guests can add nothing', () => {
    expect(addsNothing(form({ seeAll: true }))).toBe(true);
    expect(addsNothing(form({ documents: true }))).toBe(false);
  });
});

describe('permissionWords', () => {
  it('says «Лише перегляд» for a view-only link', () => {
    expect(permissionWords(toPermissions(form({ seeAll: true })), t, list)).toBe('Лише перегляд');
  });

  it('lists what guests can do, upload types by name', () => {
    expect(
      permissionWords(
        toPermissions(form({ photos: true, videos: true, documents: true, texts: true })),
        t,
        list,
      ),
    ).toBe('Гості можуть додавати фото, відео, документи і побажання та бачити лише своє');
    expect(permissionWords(toPermissions(form({ photos: true, seeAll: true })), t, list)).toBe(
      'Гості можуть додавати фото та бачити вміст усіх гостей',
    );
  });
});

describe('allowedWords', () => {
  it('names only what the organiser allowed', () => {
    expect(
      allowedWords(toPermissions(form({ photos: true, videos: true, texts: true })), t, list),
    ).toBe('Організатор дозволив додавати фото, відео і побажання');
    expect(allowedWords(toPermissions(form({ seeAll: true })), t, list)).toBe(
      'Організатор дозволив бачити вміст усіх гостей',
    );
  });
});
