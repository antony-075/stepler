import { guestLinkPermissionsSchema } from '@stepler/contracts';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import uk from '../../messages/uk.json';
import {
  addsNothing,
  fromPermissions,
  isValidForm,
  type PermissionForm,
  permissionSummary,
  permissionSummaryText,
  type SummaryKey,
  toPermissions,
} from './link-permissions';

const t = (key: SummaryKey) => uk.guestLinks.summary[key];
const tEn = (key: SummaryKey) => en.guestLinks.summary[key];

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

describe('permissionSummary', () => {
  it('lists the allowed types joined by a middle dot, then whose content guests see', () => {
    const all = toPermissions(form({ photos: true, videos: true, documents: true, texts: true }));
    expect(permissionSummary(all, t)).toEqual({
      add: 'Фото · Відео · Документи · Побажання',
      see: 'Бачать лише своє',
    });
    expect(permissionSummaryText(all, tEn)).toBe(
      'Photos · Videos · Documents · Wishes · See only their own',
    );
  });

  it('names only what is allowed, in a fixed order', () => {
    expect(
      permissionSummaryText(toPermissions(form({ texts: true, photos: true, seeAll: true })), t),
    ).toBe('Фото · Побажання · Бачать усе');
  });

  it('a view-only link reads «Лише перегляд · Бачать усе»', () => {
    expect(permissionSummaryText(toPermissions(form({ seeAll: true })), t)).toBe(
      'Лише перегляд · Бачать усе',
    );
    expect(permissionSummaryText(toPermissions(form({ seeAll: true })), tEn)).toBe(
      'View only · See everything',
    );
  });
});
