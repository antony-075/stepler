import { describe, expect, test } from 'vitest';
import {
  ACCENT_PRESETS,
  ERROR_CODES,
  FONT_IDS,
  guestPageEditorSchema,
  guestPageSchema,
  publishGuestPageRequestSchema,
  saveGuestPageDraftRequestSchema,
  hexColorSchema,
  templateIdSchema,
  themeSettingsSchema,
  type ThemeSettings,
} from './index.js';

const valid: ThemeSettings = {
  background: { kind: 'solid', color: '#F0F1EE' },
  accent: '#B83E26',
  headingFont: 'geologica',
  coverPlacement: 'top',
  align: 'start',
  corners: 'soft',
};

describe('themeSettingsSchema', () => {
  test('accepts a complete settings object, for every background kind', () => {
    expect(themeSettingsSchema.parse(valid)).toEqual(valid);
    for (const background of [
      { kind: 'gradient', preset: 'mist' },
      { kind: 'image', dim: 0 },
      { kind: 'image', dim: 90 },
    ]) {
      expect(themeSettingsSchema.safeParse({ ...valid, background }).success).toBe(true);
    }
  });

  test('rejects a lowercase or named accent, an extra key and a dim above 90', () => {
    expect(themeSettingsSchema.safeParse({ ...valid, accent: '#b83e26' }).success).toBe(false);
    expect(themeSettingsSchema.safeParse({ ...valid, accent: 'red' }).success).toBe(false);
    expect(themeSettingsSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(
      themeSettingsSchema.safeParse({ ...valid, background: { kind: 'image', dim: 91 } }).success,
    ).toBe(false);
    expect(
      themeSettingsSchema.safeParse({ ...valid, background: { kind: 'image', dim: 4.5 } }).success,
    ).toBe(false);
    expect(
      themeSettingsSchema.safeParse({
        ...valid,
        background: { kind: 'solid', color: '#FFFFFF', dim: 10 },
      }).success,
    ).toBe(false);
  });

  test('rejects an unknown font, placement, alignment or corners value', () => {
    for (const patch of [
      { headingFont: 'comic-sans' },
      { coverPlacement: 'bottom' },
      { align: 'end' },
      { corners: 'square' },
    ]) {
      expect(themeSettingsSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
  });
});

describe('vocabulary', () => {
  test('twelve fonts and six accent presets, every preset a valid colour', () => {
    expect(FONT_IDS).toHaveLength(12);
    expect(new Set(FONT_IDS).size).toBe(12);
    expect(ACCENT_PRESETS.map((preset) => preset.id)).toEqual([
      'pencil',
      'apricot',
      'plum',
      'emerald',
      'electric',
      'lime',
    ]);
    for (const preset of ACCENT_PRESETS) expect(hexColorSchema.parse(preset.hex)).toBe(preset.hex);
  });

  test('template ids are short lowercase slugs', () => {
    for (const id of ['classic', 'party', 'a', 'x1-y2']) {
      expect(templateIdSchema.safeParse(id).success).toBe(true);
    }
    for (const id of ['', 'Classic', '1st', '-a', 'a_b', 'a'.repeat(41)]) {
      expect(templateIdSchema.safeParse(id).success).toBe(false);
    }
  });
});

const IMAGE = {
  thumbnailUrl: 'https://storage.example.com/t.webp',
  previewUrl: 'https://storage.example.com/p.webp',
  largeUrl: 'https://storage.example.com/l.webp',
  width: 4000,
  height: 3000,
};
const page = {
  templateId: 'classic',
  templateVersion: 1,
  settings: valid,
  welcomeMessage: null,
  cover: null,
  background: IMAGE,
};

describe('guestPageSchema (guests)', () => {
  test('accepts the published page; rejects a draft, a revision and an image status', () => {
    expect(guestPageSchema.parse(page)).toEqual(page);
    expect(guestPageSchema.safeParse({ ...page, draft: null }).success).toBe(false);
    expect(guestPageSchema.safeParse({ ...page, revision: 1 }).success).toBe(false);
    expect(
      guestPageSchema.safeParse({ ...page, background: { ...IMAGE, status: 'READY' } }).success,
    ).toBe(false);
  });
});

describe('guestPageEditorSchema (the owner)', () => {
  const version = {
    ...page,
    background: {
      status: 'PENDING',
      thumbnailUrl: null,
      previewUrl: null,
      largeUrl: null,
      width: null,
      height: null,
    },
    updatedAt: '2026-10-05T10:00:00.000Z',
  };
  test('published and an optional draft with its revision', () => {
    expect(guestPageEditorSchema.parse({ published: version, draft: null }).draft).toBeNull();
    const editor = { published: version, draft: { ...version, revision: 3 } };
    expect(guestPageEditorSchema.parse(editor)).toEqual(editor);
    expect(guestPageEditorSchema.safeParse({ published: version, draft: version }).success).toBe(
      false,
    );
    expect(
      guestPageEditorSchema.safeParse({ published: { ...version, revision: 1 }, draft: null })
        .success,
    ).toBe(false);
  });
});

describe('saveGuestPageDraftRequestSchema', () => {
  const body = { baseRevision: null, templateId: 'classic', settings: valid, welcomeMessage: null };
  test('baseRevision null (no draft yet) or a positive revision', () => {
    expect(saveGuestPageDraftRequestSchema.parse(body)).toEqual(body);
    expect(saveGuestPageDraftRequestSchema.safeParse({ ...body, baseRevision: 4 }).success).toBe(
      true,
    );
    expect(saveGuestPageDraftRequestSchema.safeParse({ ...body, baseRevision: 0 }).success).toBe(
      false,
    );
  });

  test('the welcome is one paragraph of at most 160 code points; no image keys', () => {
    expect(
      saveGuestPageDraftRequestSchema.safeParse({ ...body, welcomeMessage: '😀'.repeat(160) })
        .success,
    ).toBe(true);
    expect(
      saveGuestPageDraftRequestSchema.safeParse({ ...body, welcomeMessage: '😀'.repeat(161) })
        .success,
    ).toBe(false);
    expect(saveGuestPageDraftRequestSchema.safeParse({ ...body, cover: null }).success).toBe(false);
  });

  test('publish names a revision', () => {
    expect(publishGuestPageRequestSchema.parse({ revision: 2 })).toEqual({ revision: 2 });
    expect(publishGuestPageRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('error codes', () => {
  test('the two guest page codes are appended', () => {
    expect(ERROR_CODES.slice(-2)).toEqual(['GUEST_PAGE_DRAFT_CONFLICT', 'THEME_CONTRAST_TOO_LOW']);
  });
});
