import next from '@stepler/config/eslint/next';

export default [
  ...next({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['eslint.config.js', 'postcss.config.mjs', 'next-env.d.ts'] },
];
