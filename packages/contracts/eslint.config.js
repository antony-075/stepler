import base from '@eventdrop/config/eslint/base';

export default [
  ...base({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['eslint.config.js'] },
];
