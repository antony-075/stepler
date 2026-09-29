import base from '@stepler/config/eslint/base';

export default [
  ...base({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['eslint.config.js'] },
];
