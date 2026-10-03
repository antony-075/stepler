import type { GuestLinkPermissions } from '@stepler/contracts';
import { describe, expect, test } from 'vitest';
import type { GuestPrincipal } from '../auth/principal.js';
import {
  canDeleteItem,
  canListAll,
  canSeeItem,
  canSubmitText,
  canUploadKind,
} from './guest-policy.js';

const SESSION = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
const OTHER = '01a0ee76-0574-7fe5-a38b-000000000002';

const none: GuestLinkPermissions = {
  canUploadPhotos: false,
  canUploadVideos: false,
  canUploadDocuments: false,
  canSubmitText: false,
  canViewGallery: false,
  canDeleteOwn: false,
};

const PERMISSIONS = Object.keys(none) as (keyof GuestLinkPermissions)[];

function guest(...allowed: (keyof GuestLinkPermissions)[]): GuestPrincipal {
  const permissions = { ...none };
  for (const name of allowed) permissions[name] = true;
  return {
    kind: 'guest',
    guestSessionId: SESSION,
    collectionId: '01a0ee76-0574-7fe5-a38b-000000000001',
    link: { id: '01a0ee76-0574-7fe5-a38b-000000000003', permissions },
  };
}

const own = { contributorGuestSessionId: SESSION };
const foreign = { contributorGuestSessionId: OTHER };
const orphan = { contributorGuestSessionId: null };

describe('guest policy, one permission at a time', () => {
  test.each(PERMISSIONS)('only %s', (permission) => {
    const p = guest(permission);
    expect(canUploadKind(p, 'PHOTO')).toBe(permission === 'canUploadPhotos');
    expect(canUploadKind(p, 'VIDEO')).toBe(permission === 'canUploadVideos');
    expect(canUploadKind(p, 'DOCUMENT')).toBe(permission === 'canUploadDocuments');
    expect(canSubmitText(p)).toBe(permission === 'canSubmitText');
    expect(canListAll(p)).toBe(permission === 'canViewGallery');
    // A guest always sees their own items; others' only with the shared gallery.
    expect(canSeeItem(p, own)).toBe(true);
    expect(canSeeItem(p, foreign)).toBe(permission === 'canViewGallery');
    expect(canSeeItem(p, orphan)).toBe(permission === 'canViewGallery');
    expect(canDeleteItem(p, own)).toBe(permission === 'canDeleteOwn');
    expect(canDeleteItem(p, foreign)).toBe(false);
    expect(canDeleteItem(p, orphan)).toBe(false);
  });
});

test('everything allowed: still never another guest’s item to delete', () => {
  const p = guest(...PERMISSIONS);
  expect(canSeeItem(p, foreign)).toBe(true);
  expect(canDeleteItem(p, own)).toBe(true);
  expect(canDeleteItem(p, foreign)).toBe(false);
  expect(canDeleteItem(p, orphan)).toBe(false);
});
