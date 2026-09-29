import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { describe, expect, test } from 'vitest';
import nest from '../eslint/nest.js';
import react from '../eslint/react.js';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

// The first lint in a preset builds a type-aware TypeScript program, which takes
// ~10 s on CI runners; the default 5 s test timeout is too tight for that.
const LINT_TIMEOUT_MS = 30_000;

async function ruleIds(config: Linter.Config[], file: string): Promise<(string | null)[]> {
  const eslint = new ESLint({ cwd: fixtures, overrideConfigFile: true, overrideConfig: config });
  const [result] = await eslint.lintFiles([file]);
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId);
}

describe('react preset', { timeout: LINT_TIMEOUT_MS }, () => {
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

  test.each(['react/literal-fallback.tsx', 'react/literal-conditional.tsx'])(
    'literal strings in logical/conditional children are errors (%s)',
    async (file) => {
      expect(await ruleIds(config, file)).toContain('no-restricted-syntax');
    },
  );

  test('literal strings in conditional user-facing attributes are errors', async () => {
    expect(await ruleIds(config, 'react/literal-aria-conditional.tsx')).toContain(
      'no-restricted-syntax',
    );
  });

  test('translated strings and className literals pass', async () => {
    expect(await ruleIds(config, 'react/translated.tsx')).toEqual([]);
  });
});

describe('nest preset', { timeout: LINT_TIMEOUT_MS }, () => {
  const config = nest({ tsconfigRootDir: `${fixtures}nest` });

  test('circular imports are an error', async () => {
    expect(await ruleIds(config, 'nest/cycle-a.ts')).toContain('import-x/no-cycle');
  });
});
