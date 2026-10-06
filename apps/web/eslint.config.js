import next from '@stepler/config/eslint/next';

/** What the editor's preview may never reach: anything that talks to the guest API (ADR 0017). */
const GUEST_API = [
  '@/guest/api',
  '@/guest/own-frames',
  '@/guest/template-slots',
  '@/guest/use-guest-session',
  '@/guest/guest-page',
  '@/guest/uploader',
  '@/guest/upload/*',
];

/** The operator console (slice 9) may be moved to its own app: the user app never reaches in. */
const OPS_CONSOLE = {
  group: ['@/ops', '@/ops/**', '@/app/ops', '@/app/ops/**'],
  message: 'The user app never imports the ops console',
};

const OPS_FILES = ['src/app/ops/**/*.{ts,tsx}', 'src/ops/**/*.{ts,tsx}'];

export default [
  ...next({ tsconfigRootDir: import.meta.dirname }),
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: OPS_FILES,
    rules: { 'no-restricted-imports': ['error', { patterns: [OPS_CONSOLE] }] },
  },
  {
    // Repeats OPS_CONSOLE: a later block's options replace the earlier ones for these files.
    files: ['src/app/preview/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: GUEST_API,
              message: 'The preview reads admin endpoints only; it never calls a guest API.',
            },
            OPS_CONSOLE,
          ],
        },
      ],
    },
  },
  {
    // The console's import boundary (plan "Console architecture"): its folders move to
    // `apps/ops` alone, so they use only the shared packages and the shared infrastructure.
    files: OPS_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/**',
                // A directory and what is under it are re-included separately (gitignore rules).
                '!@/ops',
                '!@/ops/**',
                '!@/env',
                '!@/i18n',
                '!@/i18n/**',
                '!@/theme',
                '!@/theme/**',
              ],
              message:
                'The ops console imports only @stepler/*, @/ops/** and shared infra (env, i18n, theme)',
            },
            {
              group: ['../**/app/app/**', '../**/guest/**'],
              message:
                'The ops console imports only @stepler/*, @/ops/** and shared infra (env, i18n, theme)',
            },
          ],
        },
      ],
    },
  },
  { ignores: ['eslint.config.js', 'postcss.config.mjs', 'next-env.d.ts'] },
];
