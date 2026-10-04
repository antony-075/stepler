/**
 * The package boundary of @stepler/templates (plan 2026-10-05, "Package boundary"; ADR 0017).
 *
 * Templates are presentation only: they get a typed model, actions and slots from the app and
 * never reach into it. So no source file may import Next, next-intl, TanStack Query, the web
 * app's `@/*` alias, or a path into another app or package. The core (`src/core`, and each
 * template's `definition.ts`, which the API also loads) is plain TypeScript: no React, no UI kit.
 *
 * A separate module so `src/core/registry.test.ts` can lint fixtures with exactly these rules.
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
 * Paths out of this package, at any depth: a relative climb into a sibling app (`../../web/…`,
 * `../../../apps/api/…`) or into `packages/` (import those by their package name), and any
 * specifier that names apps/web or its sources.
 */
const OUTSIDE = [
  {
    regex: '^(\\.\\./)+(apps/)?(web|api)(/|$)',
    message: 'A template never imports from another app.',
  },
  {
    regex: '^(\\.\\./)+packages/',
    message: 'Import workspace packages by name, never by a relative path.',
  },
  {
    // Non-relative specifiers only; relative climbs are the two patterns above.
    regex: '^(?!\\.)(.*/)?(apps/web|web/src)(/|$)',
    message: 'apps/web is not reachable from a template.',
  },
];

const SOURCE = '{ts,tsx}';

/** @returns {import('eslint').Linter.Config[]} */
export function boundaries() {
  return [
    {
      files: [`src/**/*.${SOURCE}`],
      rules: { 'no-restricted-imports': ['error', { patterns: [...APP_ONLY, ...OUTSIDE] }] },
    },
    // The core (any depth) and the definitions: everything above plus no React. A later config
    // overrides the rule for the files it matches, so the full list is repeated.
    {
      files: [`src/core/**/*.${SOURCE}`, `src/templates/*/definition.${SOURCE}`],
      rules: {
        'no-restricted-imports': ['error', { patterns: [...APP_ONLY, ...OUTSIDE, ...CORE_ONLY] }],
      },
    },
  ];
}
