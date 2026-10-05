import { describe, expect, test } from 'vitest';
import { classic } from '../templates/classic/definition.ts';
import { resolveTheme } from './resolve.ts';
import { classicV2 } from './test-definitions.ts';

describe('resolveTheme', () => {
  test('a valid stored page resolves as stored', () => {
    const settings = { ...classic.defaults, align: 'center' as const };
    expect(resolveTheme('classic', 1, settings)).toEqual({
      def: classic,
      settings,
      fellBack: false,
    });
  });

  test('an unknown template gives the classic defaults', () => {
    const resolved = resolveTheme('gone', 1, {});
    expect(resolved.def.id).toBe('classic');
    expect(resolved.settings).toEqual(classic.defaults);
    expect(resolved.fellBack).toBe(true);
  });

  test('settings the template does not allow, or garbage, fall back to its defaults', () => {
    for (const settings of [
      null,
      'x',
      {},
      { ...classic.defaults, coverPlacement: 'full' },
      { ...classic.defaults, background: { kind: 'solid', color: '#123456' } },
    ]) {
      expect(resolveTheme('classic', 1, settings)).toEqual({
        def: classic,
        settings: classic.defaults,
        fellBack: true,
      });
    }
  });

  test('an older version is migrated, then validated', () => {
    const { align, ...rest } = { ...classic.defaults, align: 'center' as const };
    const stored = { ...rest, alignment: align };
    const resolved = resolveTheme('classic', 1, stored, [classicV2]);
    expect(resolved.fellBack).toBe(false);
    expect(resolved.settings.align).toBe('center');
    // The same object at the current version is not migrated, so it fails and falls back.
    expect(resolveTheme('classic', 2, stored, [classicV2]).fellBack).toBe(true);
    // Garbage under the old version still falls back.
    expect(resolveTheme('classic', 1, { alignment: 7 }, [classicV2]).settings).toEqual(
      classicV2.defaults,
    );
  });

  test('a migration that throws falls back instead of throwing', () => {
    const broken = {
      ...classicV2,
      migrate: () => {
        throw new Error('broken');
      },
    };
    expect(resolveTheme('classic', 1, classic.defaults, [broken]).fellBack).toBe(true);
  });
});
