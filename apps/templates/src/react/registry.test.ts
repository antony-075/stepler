import { describe, expect, test } from 'vitest';
import { TEMPLATE_DEFINITIONS } from '../core/registry.ts';
import { TEMPLATES } from './registry.ts';

describe('TEMPLATES', () => {
  test('has a React side for exactly the registered definitions', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(TEMPLATE_DEFINITIONS.map((def) => def.id).sort());
  });

  test('each React side carries its definition unchanged', () => {
    for (const def of TEMPLATE_DEFINITIONS) {
      const template = TEMPLATES[def.id]!;
      expect(template.defaults).toEqual(def.defaults);
      expect(template.options).toEqual(def.options);
      expect(template.palette).toEqual(def.palette);
    }
  });
});
