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

export default [
  ...next({ tsconfigRootDir: import.meta.dirname }),
  {
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
          ],
        },
      ],
    },
  },
  { ignores: ['eslint.config.js', 'postcss.config.mjs', 'next-env.d.ts'] },
];
