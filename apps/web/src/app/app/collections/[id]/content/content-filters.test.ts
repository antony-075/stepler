import { describe, expect, it } from 'vitest';
import type { GuestLink, GuestLinkPermissions } from '@stepler/contracts';
import {
  filterOf,
  frameFromParam,
  lockedFilters,
  kindFromParam,
  newFramesCount,
  sortFromParam,
} from './content-filters';

describe('kindFromParam', () => {
  it.each([
    ['photo', 'PHOTO'],
    ['video', 'VIDEO'],
    ['document', 'DOCUMENT'],
    ['text', 'TEXT'],
  ] as const)('%s → %s', (param, kind) => {
    expect(kindFromParam(param)).toBe(kind);
    expect(filterOf(kind)).toBe(param);
  });

  it('anything else is no filter', () => {
    for (const param of [null, '', 'all', 'TEXT', 'audio', 'toString']) {
      expect(kindFromParam(param)).toBeUndefined();
    }
    expect(filterOf(undefined)).toBe('all');
  });
});

describe('frameFromParam', () => {
  it('a positive integer', () => {
    expect(frameFromParam('86')).toBe(86);
    expect(frameFromParam('1')).toBe(1);
  });
  it('nothing else', () => {
    for (const param of [null, '', '0', '-1', '086', '1.5', 'x', '1e3', '9999999999']) {
      expect(frameFromParam(param)).toBeUndefined();
    }
  });
});

describe('sortFromParam', () => {
  it('frame or newest', () => {
    expect(sortFromParam('frame')).toBe('frame');
    expect(sortFromParam(null)).toBe('newest');
    expect(sortFromParam('oldest')).toBe('newest');
  });
});

describe('newFramesCount', () => {
  it('counts 10 → 13 gives 3', () => {
    expect(newFramesCount(10, 13)).toBe(3);
  });
  it('is 0 before a baseline, and never negative after deletions', () => {
    expect(newFramesCount(null, 13)).toBe(0);
    expect(newFramesCount(10, undefined)).toBe(0);
    expect(newFramesCount(10, 8)).toBe(0);
  });
});

describe('lockedFilters', () => {
  const none: GuestLinkPermissions = {
    canUploadPhotos: false,
    canUploadVideos: false,
    canUploadDocuments: false,
    canSubmitText: false,
    canViewGallery: true,
    canDeleteOwn: false,
  };
  const link = (status: GuestLink['status'], permissions: Partial<GuestLinkPermissions>) =>
    ({ status, permissions: { ...none, ...permissions } }) as Pick<
      GuestLink,
      'status' | 'permissions'
    >;
  const zero = { photo: 0, video: 0, document: 0, text: 0 };

  it('locks a type no live link allows while it has nothing', () => {
    const links = [
      link('ACTIVE', { canSubmitText: true }),
      link('INACTIVE', { canUploadPhotos: true }),
    ];
    expect([...lockedFilters(links, zero)].sort()).toEqual(['document', 'video']);
  });

  it('a revoked link allows nothing', () => {
    const links = [
      link('REVOKED', { canUploadVideos: true }),
      link('ACTIVE', { canSubmitText: true }),
    ];
    expect(lockedFilters(links, zero).has('video')).toBe(true);
  });

  it('keeps a type with frames enabled, whatever the links allow', () => {
    expect(lockedFilters([], { ...zero, video: 2 }).has('video')).toBe(false);
    expect([...lockedFilters([], { ...zero, video: 2 })].sort()).toEqual([
      'document',
      'photo',
      'text',
    ]);
  });

  it('never locks «all», nor anything before links and counts load', () => {
    expect(lockedFilters([], zero).has('all')).toBe(false);
    expect(lockedFilters(undefined, zero).size).toBe(0);
    expect(lockedFilters([], undefined).size).toBe(0);
  });
});
