/**
 * The package boundary of @stepler/templates (plan 2026-10-05, "Package boundary"; ADR 0017).
 *
 * Templates are presentation only: they get a typed model, actions and slots from the app and
 * never reach into it. So no source file may import Next, next-intl, TanStack Query, the web
 * app's `@/*` alias, or a relative path that leaves this package. The core (`src/core`, and each
 * template's `definition.ts`, which the API also loads) is plain TypeScript: no React, no UI kit.
 *
 * A separate module so `src/core/boundaries.test.ts` can lint fixtures with exactly these rules.
 */

const APP_ONLY = [
  {
    group: ['next', 'next/*'],
    message: 'Templates do not depend on Next.js; the app passes data in.',
  },
  { group: ['next-intl', 'next-intl/*'], message: 'Templates get their strings from the model.' },
  { group: ['@tanstack/*'], message: 'Data fetching stays in apps/web.' },
  { group: ['@/*'], message: 'apps/web is not reachable from a template.' },
];

const CORE_ONLY = [
  {
    group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    message: 'The core is plain TypeScript.',
  },
  { group: ['@stepler/ui', '@stepler/ui/*'], message: 'The core is plain TypeScript.' },
  { group: ['lucide-react'], message: 'The core is plain TypeScript.' },
];

/**
 * A relative import that climbs above the package root. Flat config cannot say "outside this
 * directory", so the limit is the file's depth below the package root (src/x.ts is depth 1).
 * @param {number} depth
 */
function leavingPackage(depth) {
  return {
    regex: `^(\\.\\./){${depth + 1},}`,
    message: 'A template never imports from outside apps/templates.',
  };
}

const SOURCE = '{ts,tsx}';

/** @returns {import('eslint').Linter.Config[]} */
export function boundaries() {
  /** @type {import('eslint').Linter.Config[]} */
  const configs = [];
  for (const depth of [1, 2, 3, 4]) {
    const dirs = Array.from({ length: depth - 1 }, () => '*').join('/');
    const glob = `src/${dirs === '' ? '' : `${dirs}/`}*.${SOURCE}`;
    configs.push({
      files: [glob],
      rules: {
        'no-restricted-imports': ['error', { patterns: [...APP_ONLY, leavingPackage(depth)] }],
      },
    });
  }
  // The core and the definitions: everything above plus no React. Later configs override the
  // rule for the files they match, so the full list is repeated.
  configs.push(
    {
      files: [`src/core/*.${SOURCE}`],
      rules: {
        'no-restricted-imports': [
          'error',
          { patterns: [...APP_ONLY, ...CORE_ONLY, leavingPackage(2)] },
        ],
      },
    },
    {
      files: [`src/templates/*/definition.${SOURCE}`],
      rules: {
        'no-restricted-imports': [
          'error',
          { patterns: [...APP_ONLY, ...CORE_ONLY, leavingPackage(3)] },
        ],
      },
    },
  );
  return configs;
}
