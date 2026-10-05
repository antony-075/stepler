import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, test } from 'vitest';
import { boundaries } from '../../eslint.boundaries.js';
import { DEFAULT_TEMPLATE_ID, definitionOf, TEMPLATE_DEFINITIONS } from './registry.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const templatesDir = fileURLToPath(new URL('../templates/', import.meta.url));

describe('registry', () => {
  test('ids are unique and match the folders under src/templates', () => {
    const ids = TEMPLATE_DEFINITIONS.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
    const folders = readdirSync(templatesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect([...ids].sort()).toEqual(folders.sort());
  });

  test('the default template is registered; unknown ids are undefined', () => {
    expect(definitionOf(DEFAULT_TEMPLATE_ID)?.id).toBe('classic');
    expect(definitionOf('gone')).toBeUndefined();
  });
});

describe('package boundary (lint)', () => {
  // Exactly the boundary rules, without type information, so fixtures need no real files.
  const eslint = new ESLint({
    cwd: packageRoot,
    overrideConfigFile: true,
    overrideConfig: boundaries(),
  });

  async function errors(filePath: string, code: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath });
    return (result?.messages ?? []).map((message) => message.ruleId ?? message.message);
  }

  test.each([
    ['src/react/a.ts', "import { useLocale } from 'next-intl';"],
    ['src/react/a.ts', "import Link from 'next/link';"],
    ['src/react/a.ts', "import { useQuery } from '@tanstack/react-query';"],
    ['src/react/a.ts', "import { GuestPage } from '@/guest/guest-page';"],
    ['src/react/a.ts', "import x from '../../../web/src/guest/guest-page';"],
    ['src/templates/classic/layout.ts', "import x from '../../../../web/src/app/fonts';"],
    ['src/core/a.ts', "import { useState } from 'react';"],
    ['src/core/a.ts', "import { Button } from '@stepler/ui/components/button';"],
    ['src/templates/classic/definition.ts', "import { useState } from 'react';"],
    // Any depth: a deep file, and core subfolders.
    ['src/templates/classic/parts/deep/x/y.tsx', "import x from '../../../../../../../web/src/a';"],
    ['src/templates/classic/parts/deep/x/y.tsx', "import x from '../../../../../../web/a';"],
    [
      'src/templates/classic/parts/deep/x/y.tsx',
      "import x from '../../../../../../../../packages/ui/src/a';",
    ],
    ['src/a/b/c/d/e.ts', "import x from '../../../../../../../apps/web/src/guest/api';"],
    ['src/core/math/deep/a.ts', "import { useState } from 'react';"],
    ['src/react/a.ts', "import x from 'apps/web/src/guest/api';"],
    ['src/core/math/deep/a.ts', "import x from '../../../../../web/src/a';"],
  ])('%s: %s is an error', async (filePath, code) => {
    expect(await errors(filePath, code)).toEqual(['no-restricted-imports']);
  });

  test.each([
    ['src/react/a.ts', "import { useState } from 'react';"],
    ['src/react/a.ts', "import { Button } from '@stepler/ui/components/button';"],
    ['src/react/a.ts', "import { classic } from '../templates/classic/definition';"],
    ['src/templates/classic/layout.ts', "import x from '../../../fonts/fonts.css';"],
    ['src/core/a.ts', "import { z } from 'zod';"],
    ['src/core/a.ts', "import { themeSettingsSchema } from '@stepler/contracts';"],
    ['src/templates/classic/parts/deep/x/y.tsx', "import { classic } from '../../../../index.ts';"],
    [
      'src/templates/classic/parts/deep/x/y.tsx',
      "import x from '../../../../../../../fonts/a.css';",
    ],
  ])('%s: %s is allowed', async (filePath, code) => {
    expect(await errors(filePath, code)).toEqual([]);
  });
});
