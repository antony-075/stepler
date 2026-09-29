import nest from '@stepler/config/eslint/nest';

export default [
  ...nest({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['eslint.config.js'] },
];
