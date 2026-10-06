import { describe, expect, it } from 'vitest';
import { DASHBOARD_VIEW_KEY, readDashboardView, writeDashboardView } from './dashboard-view';

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

describe('dashboard view', () => {
  it('is the table by default, without storage or with nothing stored', () => {
    expect(readDashboardView(() => null)).toBe('table');
    expect(readDashboardView(() => memory())).toBe('table');
  });

  it('reads back what was written', () => {
    const storage = memory();
    writeDashboardView(() => storage, 'tiles');
    expect(storage.values.get(DASHBOARD_VIEW_KEY)).toBe('tiles');
    expect(readDashboardView(() => storage)).toBe('tiles');
    writeDashboardView(() => storage, 'table');
    expect(readDashboardView(() => storage)).toBe('table');
  });

  it('ignores an unknown stored value', () => {
    expect(readDashboardView(() => memory({ [DASHBOARD_VIEW_KEY]: 'grid' }))).toBe('table');
  });

  it('survives a storage that throws, or whose access throws', () => {
    expect(readDashboardView(() => throwing)).toBe('table');
    expect(() => writeDashboardView(() => throwing, 'tiles')).not.toThrow();
    const denied = () => {
      throw new Error('SecurityError');
    };
    expect(readDashboardView(denied)).toBe('table');
    expect(() => writeDashboardView(denied, 'tiles')).not.toThrow();
  });
});
