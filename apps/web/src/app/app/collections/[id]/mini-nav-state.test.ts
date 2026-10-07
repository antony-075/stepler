import { describe, expect, it } from 'vitest';
import {
  isMiniNavCollapsed,
  MINI_NAV_EDITOR_KEY,
  MINI_NAV_KEY,
  type MiniNavChoices,
  readMiniNavChoices,
  writeMiniNavChoice,
} from './mini-nav-state';

function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

const none: MiniNavChoices = { general: null, editor: null };

describe('mini-nav storage', () => {
  it('has no choices without storage, with nothing stored or with unknown values', () => {
    expect(readMiniNavChoices(() => null)).toEqual(none);
    expect(readMiniNavChoices(() => memory())).toEqual(none);
    expect(readMiniNavChoices(() => memory({ [MINI_NAV_KEY]: 'folded' }))).toEqual(none);
  });

  it('keeps the editor tab and the other tabs apart', () => {
    const storage = memory();
    writeMiniNavChoice(() => storage, 'editor', 'expanded');
    writeMiniNavChoice(() => storage, 'general', 'collapsed');
    expect(storage.values.get(MINI_NAV_EDITOR_KEY)).toBe('expanded');
    expect(storage.values.get(MINI_NAV_KEY)).toBe('collapsed');
    expect(readMiniNavChoices(() => storage)).toEqual({ general: 'collapsed', editor: 'expanded' });
  });

  it('works without a storage that works', () => {
    expect(readMiniNavChoices(() => throwing)).toEqual(none);
    expect(() => writeMiniNavChoice(() => throwing, 'general', 'collapsed')).not.toThrow();
    expect(() =>
      writeMiniNavChoice(
        () => {
          throw new Error('no localStorage');
        },
        'editor',
        'collapsed',
      ),
    ).not.toThrow();
  });
});

describe('isMiniNavCollapsed', () => {
  it('is expanded on the other tabs until folded there', () => {
    for (const roomy of [true, false]) {
      expect(isMiniNavCollapsed({ editorTab: false, roomy, choices: none })).toBe(false);
      expect(
        isMiniNavCollapsed({
          editorTab: false,
          roomy,
          choices: { general: 'collapsed', editor: 'expanded' },
        }),
      ).toBe(true);
    }
  });

  it('starts folded on the editor tab under 1700px, following the other tabs above it', () => {
    expect(isMiniNavCollapsed({ editorTab: true, roomy: false, choices: none })).toBe(true);
    expect(
      isMiniNavCollapsed({
        editorTab: true,
        roomy: false,
        choices: { general: 'expanded', editor: null },
      }),
    ).toBe(true);
    expect(isMiniNavCollapsed({ editorTab: true, roomy: true, choices: none })).toBe(false);
    expect(
      isMiniNavCollapsed({
        editorTab: true,
        roomy: true,
        choices: { general: 'collapsed', editor: null },
      }),
    ).toBe(true);
  });

  it('follows a choice made on the editor tab at any width', () => {
    for (const roomy of [true, false]) {
      expect(
        isMiniNavCollapsed({
          editorTab: true,
          roomy,
          choices: { general: 'collapsed', editor: 'expanded' },
        }),
      ).toBe(false);
      expect(
        isMiniNavCollapsed({
          editorTab: true,
          roomy,
          choices: { general: 'expanded', editor: 'collapsed' },
        }),
      ).toBe(true);
    }
  });
});
