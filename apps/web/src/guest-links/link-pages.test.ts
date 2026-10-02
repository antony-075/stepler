import type { GuestLink } from '@stepler/contracts';
import { describe, expect, it } from 'vitest';
import { allLinksPath, findLink, linkKey, linkSettingsPath, MAIN_LINK } from './link-pages';

const PERMISSIONS = {
  canUploadPhotos: true,
  canUploadVideos: true,
  canUploadDocuments: true,
  canSubmitText: true,
  canViewGallery: false,
  canDeleteOwn: true,
};
const link = (id: string, isDefault: boolean, status: GuestLink['status']): GuestLink => ({
  id,
  isDefault,
  label: isDefault ? null : 'Фотограф',
  status,
  permissions: PERMISSIONS,
  url: status === 'REVOKED' ? null : `https://stepler.test/g/${id}`,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  revokedAt: status === 'REVOKED' ? '2026-10-02T10:00:00.000Z' : null,
});

const main = link('00000000-0000-4000-8000-000000000001', true, 'ACTIVE');
const extra = link('00000000-0000-4000-8000-000000000002', false, 'INACTIVE');
const revoked = link('00000000-0000-4000-8000-000000000003', false, 'REVOKED');

describe('link pages', () => {
  it('names the default link «main», so its settings survive a rotation', () => {
    expect(linkKey(main)).toBe(MAIN_LINK);
    expect(linkKey(extra)).toBe(extra.id);
    expect(linkSettingsPath('c1', MAIN_LINK)).toBe('/app/collections/c1?tab=links&link=main');
    expect(linkSettingsPath('c1', extra.id)).toBe(`/app/collections/c1?tab=links&link=${extra.id}`);
    expect(allLinksPath('c1')).toBe('/app/collections/c1?tab=links');
  });

  it('finds the live default for «main» and other live links by id', () => {
    expect(findLink([main, extra, revoked], MAIN_LINK)).toBe(main);
    expect(findLink([main, extra, revoked], extra.id)).toBe(extra);
  });

  it('gives a revoked or unknown link no page', () => {
    expect(findLink([main, extra, revoked], revoked.id)).toBeUndefined();
    expect(findLink([main], extra.id)).toBeUndefined();
    // The default's own id is not «main»: only the alias follows rotations.
    expect(findLink([extra], MAIN_LINK)).toBeUndefined();
  });
});
