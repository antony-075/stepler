import { definitionOf } from '@stepler/templates/core';
import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  COALESCE_MS,
  dropImage,
  HISTORY_LIMIT,
  initHistory,
  record,
  redo,
  type Snapshot,
  undo,
} from './history';

const classic = definitionOf('classic')!;
const snap = (welcome: string | null, cover: string | null = null): Snapshot => ({
  working: { templateId: 'classic', settings: classic.defaults, welcomeMessage: welcome },
  images: { cover, background: null },
});

describe('the undo history (owner remark 113)', () => {
  it('records a step, undoes and redoes it; a new change clears redo', () => {
    let h = initHistory(snap(null));
    expect(canUndo(h)).toBe(false);
    h = record(h, snap('a'), null, 0);
    h = record(h, snap('b'), null, 1000);
    expect(h.past).toHaveLength(2);
    h = undo(h)!;
    expect(h.present.working.welcomeMessage).toBe('a');
    expect(canRedo(h)).toBe(true);
    h = redo(h)!;
    expect(h.present.working.welcomeMessage).toBe('b');
    h = undo(h)!;
    h = record(h, snap('c'), null, 2000);
    expect(canRedo(h)).toBe(false);
    expect(redo(h)).toBeNull();
  });

  it('coalesces rapid changes of one control, not of different ones', () => {
    let h = initHistory(snap(null));
    h = record(h, snap('П'), 'welcome', 0);
    h = record(h, snap('Пр'), 'welcome', 200);
    h = record(h, snap('При'), 'welcome', 400);
    expect(h.past).toHaveLength(1);
    expect(h.present.working.welcomeMessage).toBe('При');
    h = record(h, snap('Прив'), 'welcome', 400 + COALESCE_MS + 1);
    expect(h.past).toHaveLength(2);
    h = record(h, snap('Прив', 'img'), null, 400 + COALESCE_MS + 2);
    expect(h.past).toHaveLength(3);
  });

  it('a value set back to the present records nothing; the history is capped', () => {
    let h = initHistory(snap(null));
    expect(record(h, snap(null), null, 0)).toBe(h);
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) h = record(h, snap(`v${i}`), null, i * 1000);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });

  it('image steps undo to the previous image; a gone image drops its steps', () => {
    let h = initHistory(snap(null, 'a'));
    h = record(h, snap(null, 'b'), null, 0);
    expect(undo(h)!.present.images.cover).toBe('a');
    h = dropImage(h, 'a');
    expect(canUndo(h)).toBe(false);
  });
});
