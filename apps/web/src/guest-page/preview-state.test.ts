import { describe, expect, it } from 'vitest';
import {
  contentRefusal,
  DEFAULT_PREVIEW_STATE,
  PREVIEW_CONTENT,
  previewShape,
  withAccess,
} from './preview-state';

describe('contentRefusal', () => {
  it('a link that shows everything takes every content', () => {
    for (const content of PREVIEW_CONTENT) expect(contentRefusal('all', content)).toBeNull();
  });

  it('a link without the gallery refuses others’ frames', () => {
    expect(contentRefusal('own', 'others')).toBe('hidden-gallery');
    expect(contentRefusal('own', 'both')).toBe('hidden-gallery');
    expect(contentRefusal('own', 'mine')).toBeNull();
    expect(contentRefusal('own', 'uploading')).toBeNull();
  });

  it('a view-only link refuses the guest’s own frames and uploads', () => {
    expect(contentRefusal('view', 'mine')).toBe('view-only');
    expect(contentRefusal('view', 'both')).toBe('view-only');
    expect(contentRefusal('view', 'uploading')).toBe('view-only');
    expect(contentRefusal('view', 'others')).toBeNull();
  });

  it('a paused or closed link shows no content', () => {
    expect(contentRefusal('paused', 'both')).toBe('stopped');
    expect(contentRefusal('closed', 'mine')).toBe('stopped');
    expect(contentRefusal('closed', 'empty')).toBeNull();
  });
});

describe('withAccess', () => {
  it('keeps the content that still makes sense, else falls back', () => {
    expect(withAccess({ access: 'all', content: 'mine' }, 'own')).toEqual({
      access: 'own',
      content: 'mine',
    });
    expect(withAccess(DEFAULT_PREVIEW_STATE, 'own')).toEqual({ access: 'own', content: 'mine' });
    expect(withAccess(DEFAULT_PREVIEW_STATE, 'view')).toEqual({
      access: 'view',
      content: 'others',
    });
  });
});

describe('previewShape', () => {
  it('the default: own frames, and everyone’s in the gallery', () => {
    expect(previewShape(DEFAULT_PREVIEW_STATE)).toEqual({
      kind: 'page',
      own: 'items',
      all: 'both',
      actions: true,
    });
  });

  it('«Лише своє» never draws «Усі кадри» (owner remark 91)', () => {
    for (const content of PREVIEW_CONTENT) {
      const shape = previewShape({ access: 'own', content });
      expect(shape.kind === 'page' && shape.all).toBe('none');
    }
  });

  it('view-only: no actions and no own frames', () => {
    expect(previewShape({ access: 'view', content: 'others' })).toEqual({
      kind: 'page',
      own: 'none',
      all: 'others',
      actions: false,
    });
  });

  it('paused and closed are the link state pages', () => {
    expect(previewShape({ access: 'paused', content: 'both' })).toEqual({
      kind: 'link-state',
      state: 'paused',
    });
  });
});
