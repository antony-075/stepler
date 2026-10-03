import { describe, expect, test } from 'vitest';
import {
  ERROR_CODES,
  createGuestLinkRequestSchema,
  guestLinkLabelSchema,
  guestLinkPermissionsSchema,
  guestLinkSchema,
  resolveGuestLinkRequestSchema,
  resolveGuestLinkResponseSchema,
  rotateDefaultLinkRequestSchema,
  updateGuestLinkRequestSchema,
} from './index.js';

const none = {
  canUploadPhotos: false,
  canUploadVideos: false,
  canUploadDocuments: false,
  canSubmitText: false,
  canViewGallery: false,
  canDeleteOwn: false,
};

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('guestLinkPermissionsSchema', () => {
  test('rejects a link that allows nothing', () => {
    const result = guestLinkPermissionsSchema.safeParse(none);
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('NO_CAPABILITY');
  });

  test('accepts a view-only link (F3)', () => {
    const viewOnly = { ...none, canViewGallery: true };
    expect(guestLinkPermissionsSchema.parse(viewOnly)).toEqual(viewOnly);
  });

  test('delete-own needs a contribution permission', () => {
    const result = guestLinkPermissionsSchema.safeParse({
      ...none,
      canViewGallery: true,
      canDeleteOwn: true,
    });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('DELETE_OWN_REQUIRES_CONTRIBUTION');
    expect(result.error?.issues[0]?.path).toEqual([]);
  });

  test('each upload type alone is a contribution (photos, videos and documents are separate)', () => {
    for (const only of ['canUploadPhotos', 'canUploadVideos', 'canUploadDocuments'] as const) {
      const permissions = { ...none, [only]: true, canDeleteOwn: true };
      expect(guestLinkPermissionsSchema.parse(permissions)).toEqual(permissions);
    }
  });

  test('rejects the old single upload flag', () => {
    expect(guestLinkPermissionsSchema.safeParse({ ...none, canUploadFiles: true }).success).toBe(
      false,
    );
  });

  test('rejects extra keys', () => {
    expect(
      guestLinkPermissionsSchema.safeParse({
        ...none,
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
        isAdmin: true,
      }).success,
    ).toBe(false);
  });
});

describe('guestLinkLabelSchema', () => {
  test('trims and limits to 1..60 characters', () => {
    expect(guestLinkLabelSchema.parse('  Фотограф ')).toBe('Фотограф');
    expect(guestLinkLabelSchema.safeParse('').success).toBe(false);
    expect(guestLinkLabelSchema.safeParse('   ').success).toBe(false);
    expect(guestLinkLabelSchema.safeParse('x'.repeat(60)).success).toBe(true);
    expect(guestLinkLabelSchema.safeParse('x'.repeat(61)).success).toBe(false);
  });

  test('rejects control characters', () => {
    expect(guestLinkLabelSchema.safeParse('A\u0000B').success).toBe(false);
    expect(guestLinkLabelSchema.safeParse('A\nB').success).toBe(false);
  });
});

describe('request schemas', () => {
  test('create needs a label and valid permissions', () => {
    const body = {
      label: 'Фотограф',
      permissions: {
        ...none,
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
      },
    };
    expect(createGuestLinkRequestSchema.parse(body)).toEqual(body);
    expect(createGuestLinkRequestSchema.safeParse({ permissions: body.permissions }).success).toBe(
      false,
    );
    expect(createGuestLinkRequestSchema.safeParse({ ...body, permissions: none }).success).toBe(
      false,
    );
  });

  test('update needs at least one field', () => {
    expect(updateGuestLinkRequestSchema.safeParse({}).success).toBe(false);
    expect(updateGuestLinkRequestSchema.parse({ label: ' A ' })).toEqual({ label: 'A' });
    expect(updateGuestLinkRequestSchema.safeParse({ status: 'ACTIVE' }).success).toBe(false);
  });

  test('rotate takes the expected link id', () => {
    expect(rotateDefaultLinkRequestSchema.safeParse({ expectedLinkId: 'nope' }).success).toBe(
      false,
    );
    expect(
      rotateDefaultLinkRequestSchema.safeParse({
        expectedLinkId: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
      }).success,
    ).toBe(true);
  });

  test('resolve accepts any short string; the format is checked by the service', () => {
    expect(resolveGuestLinkRequestSchema.safeParse({ linkToken: 'x' }).success).toBe(true);
    expect(resolveGuestLinkRequestSchema.safeParse({ linkToken: '' }).success).toBe(false);
    expect(resolveGuestLinkRequestSchema.safeParse({ linkToken: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });
});

describe('guestLinkSchema', () => {
  const link = {
    id: '01a0ee76-0574-7fe5-a38b-53b07a9b40f9',
    isDefault: true,
    label: null,
    status: 'ACTIVE',
    permissions: {
      canUploadPhotos: true,
      canUploadVideos: true,
      canUploadDocuments: true,
      canSubmitText: true,
      canViewGallery: false,
      canDeleteOwn: true,
    },
    url: 'http://localhost:3000/g/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    revokedAt: null,
  };

  test('accepts a live link and a revoked one without a URL', () => {
    expect(guestLinkSchema.parse(link)).toEqual(link);
    const revoked = {
      ...link,
      isDefault: false,
      label: 'Фотограф',
      status: 'REVOKED',
      url: null,
      revokedAt: '2026-10-02T10:00:00.000Z',
    };
    expect(guestLinkSchema.parse(revoked)).toEqual(revoked);
  });

  test('rejects internal fields', () => {
    expect(guestLinkSchema.safeParse({ ...link, tokenHash: 'x' }).success).toBe(false);
  });
});

describe('resolveGuestLinkResponseSchema', () => {
  const collectionId = '01a0ee76-0574-7fe5-a38b-53b07a9b40f9';
  const body = {
    collectionId,
    collection: { title: 'Wedding', description: null },
    permissions: { ...none, canViewGallery: true },
  };

  test('carries the collection id for the session exchange [C3] and the public fields', () => {
    expect(resolveGuestLinkResponseSchema.parse(body)).toEqual(body);
    const withoutId: Partial<typeof body> = { ...body };
    delete withoutId.collectionId;
    expect(resolveGuestLinkResponseSchema.safeParse(withoutId).success).toBe(false);
  });

  test('nothing else: no link or owner ids', () => {
    for (const extra of [{ linkId: collectionId }, { ownerId: collectionId }]) {
      expect(resolveGuestLinkResponseSchema.safeParse({ ...body, ...extra }).success).toBe(false);
    }
    expect(
      resolveGuestLinkResponseSchema.safeParse({
        ...body,
        collection: { ...body.collection, id: collectionId },
      }).success,
    ).toBe(false);
  });
});

test('ERROR_CODES contains the guest link codes', () => {
  for (const code of [
    'GUEST_LINK_LIMIT_REACHED',
    'LINK_REVOKED',
    'LINK_INACTIVE',
    'DEFAULT_LINK_NOT_REVOCABLE',
    'COLLECTION_ARCHIVED',
    'COLLECTION_UNAVAILABLE',
  ]) {
    expect(ERROR_CODES).toContain(code);
  }
});
