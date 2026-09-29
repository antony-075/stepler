import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { describe, expect, test } from 'vitest';
import nest from '../eslint/nest.js';
import react from '../eslint/react.js';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

async function ruleIds(config: Linter.Config[], file: string): Promise<(string | null)[]> {
  const eslint = new ESLint({ cwd: fixtures, overrideConfigFile: true, overrideConfig: config });
  const [result] = await eslint.lintFiles([file]);
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId);
}

describe('react preset', () => {
  // The config package does not install react, so pin the version instead of 'detect'.
  const config = [
    ...react({ tsconfigRootDir: `${fixtures}react` }),
    { settings: { react: { version: '19.3' } } },
  ];

  test('literal JSX text is an error', async () => {
    expect(await ruleIds(config, 'react/literal-text.tsx')).toContain('react/jsx-no-literals');
  });

  test('literal aria-label/title/alt/placeholder is an error', async () => {
    expect(await ruleIds(config, 'react/literal-aria.tsx')).toContain('no-restricted-syntax');
  });

  test('translated strings and className literals pass', async () => {
    expect(await ruleIds(config, 'react/translated.tsx')).toEqual([]);
  });
});

describe('nest preset', () => {
  const config = nest({ tsconfigRootDir: `${fixtures}nest` });

  test('circular imports are an error', async () => {
    expect(await ruleIds(config, 'nest/cycle-a.ts')).toContain('import-x/no-cycle');
  });
});
