import { ESLint } from 'eslint';
import { describe, expect, test } from 'vitest';

// The ops console's import boundary (slice 9, plan "Console architecture"): it moves to its own
// app alone, and the user app never reaches into it.

const eslint = new ESLint({ cwd: new URL('../..', import.meta.url).pathname });

/** Lints `code` as if it were `filePath` (a real file: typed linting needs it in the project). */
async function boundaryErrors(filePath: string, code: string): Promise<number> {
  const [result] = await eslint.lintText(`${code}\nexport const used = x;\n`, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports').length;
}

describe('ops console import boundary', () => {
  test.each([
    ['src/ops/ops-shell.tsx', "import { x } from '@/app/app/admin-nav';"],
    ['src/app/ops/page.tsx', "import { apiRequest as x } from '@/api/client';"],
    ['src/ops/ops-shell.tsx', "import { x } from '../guest/guest-viewer';"],
    ['src/app/app/page.tsx', "import { opsRequest as x } from '@/ops/api/client';"],
    ['src/guest/api.ts', "import { x } from '@/app/ops/layout';"],
    ['src/app/preview/collections/[id]/page.tsx', "import { x } from '@/ops/ops-shell';"],
  ])(
    '%s: %s → refused',
    async (file, code) => {
      expect(await boundaryErrors(file, code)).toBe(1);
    },
    30_000,
  );

  test.each([
    ['src/ops/ops-shell.tsx', "import { Badge as x } from '@stepler/ui/components/badge';"],
    ['src/ops/ops-shell.tsx', "import { resolveLocale as x } from '@/i18n/resolve-locale';"],
    ['src/ops/api/server.ts', "import { getWebEnv as x } from '@/env';"],
    ['src/app/ops/page.tsx', "import { opsRequest as x } from '@/ops/api/client';"],
  ])(
    '%s: %s → allowed',
    async (file, code) => {
      expect(await boundaryErrors(file, code)).toBe(0);
    },
    30_000,
  );
});
