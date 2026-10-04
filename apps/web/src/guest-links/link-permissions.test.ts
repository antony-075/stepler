import { guestLinkPermissionsSchema } from '@stepler/contracts';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import uk from '../../messages/uk.json';
import {
  addsNothing,
  fromPermissions,
  isValidForm,
  normalizeForm,
  type PermissionForm,
  permissionSummary,
  permissionSummaryText,
  type SummaryKey,
  toPermissions,
} from './link-permissions';

const t = (key: SummaryKey) => uk.guestLinks.summary[key];
const tEn = (key: SummaryKey) => en.guestLinks.summary[key];

const FLAGS = ['photos', 'videos', 'documents', 'texts', 'deleteOwn', 'seeAll'] as const;
/** Every combination of the six answers (64 forms). */
const ALL_FORMS: PermissionForm[] = Array.from({ length: 2 ** FLAGS.length }, (_, bits) =>
  Object.fromEntries(FLAGS.map((flag, i) => [flag, (bits & (1 << i)) !== 0])),
) as PermissionForm[];
/** Valid, and as the editor leaves them (no delete-own without something to add). */
const VALID_FORMS = ALL_FORMS.filter((f) => isValidForm(f) && normalizeForm(f) === f);

const form = (on: Partial<PermissionForm>): PermissionForm => ({
  photos: false,
  videos: false,
  documents: false,
  texts: false,
  deleteOwn: false,
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

  it('keeps upload types separate; delete-own as asked [C15]', () => {
    expect(toPermissions(form({ videos: true, deleteOwn: true }))).toEqual({
      canUploadPhotos: false,
      canUploadVideos: true,
      canUploadDocuments: false,
      canSubmitText: false,
      canViewGallery: false,
      canDeleteOwn: true,
    });
  });

  it('round-trips canDeleteOwn: false on a contributing link', () => {
    const off = form({ photos: true, texts: true, deleteOwn: false });
    expect(toPermissions(off).canDeleteOwn).toBe(false);
    expect(fromPermissions(toPermissions(off))).toEqual(off);
  });

  it('never sends canDeleteOwn without something to add (the contract refuses it)', () => {
    expect(toPermissions(form({ seeAll: true, deleteOwn: true })).canDeleteOwn).toBe(false);
  });

  it('produces permissions the contract accepts, and round-trips, for every valid form', () => {
    // 31 valid answers to the add/see questions; delete-own doubles the 30 that can contribute.
    expect(VALID_FORMS).toHaveLength(61);
    for (const valid of VALID_FORMS) {
      const permissions = toPermissions(valid);
      expect(guestLinkPermissionsSchema.safeParse(permissions).success).toBe(true);
      expect(fromPermissions(permissions)).toEqual(valid);
    }
  });
});

describe('normalizeForm', () => {
  it('turns delete-own off when every contribution type is turned off', () => {
    expect(normalizeForm(form({ seeAll: true, deleteOwn: true }))).toEqual(form({ seeAll: true }));
  });

  it('leaves it alone while something can be added', () => {
    const on = form({ texts: true, deleteOwn: true });
    expect(normalizeForm(on)).toBe(on);
  });
});

describe('isValidForm and addsNothing', () => {
  it('rejects only the link that allows nothing at all', () => {
    expect(ALL_FORMS.filter((f) => !isValidForm(f))).toEqual([form({}), form({ deleteOwn: true })]);
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

  it('adds «Можуть видаляти своє» when guests may delete their own [C15]', () => {
    const p = toPermissions(form({ photos: true, deleteOwn: true, seeAll: true }));
    expect(permissionSummaryText(p, t)).toBe('Фото · Бачать усе · Можуть видаляти своє');
    expect(permissionSummaryText(p, tEn)).toBe('Photos · See everything · Can delete their own');
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
