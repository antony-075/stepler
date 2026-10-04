import { describe, expect, test } from 'vitest';
import { classic } from '../templates/classic/definition.js';
import { applyTemplate } from './apply-template.js';
import { fullscreenLike } from './test-definitions.js';

describe('applyTemplate', () => {
  const classicCenterSoft = {
    ...classic.defaults,
    accent: '#8B5CF6',
    headingFont: 'lora' as const,
    align: 'center' as const,
    corners: 'soft' as const,
  };

  test('switching to fullscreen keeps centre and soft, and forces full and an image', () => {
    const next = applyTemplate(fullscreenLike, classicCenterSoft);
    expect(next.align).toBe('center');
    expect(next.corners).toBe('soft');
    expect(next.coverPlacement).toBe('full');
    expect(next.background).toEqual({ kind: 'image', dim: 45 });
  });

  test('accent and heading font reset to the new template’s defaults', () => {
    const next = applyTemplate(fullscreenLike, classicCenterSoft);
    expect(next.accent).toBe('#F2A65A');
    expect(next.headingFont).toBe('manrope');
  });

  test('back to classic: a placement it does not allow becomes its default', () => {
    const next = applyTemplate(classic, applyTemplate(fullscreenLike, classicCenterSoft));
    expect(next.coverPlacement).toBe('top');
    expect(next.align).toBe('center');
    expect(next).toEqual({ ...classic.defaults, align: 'center' });
  });
});
