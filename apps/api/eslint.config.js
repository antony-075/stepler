import nest from '@eventdrop/config/eslint/nest';

export default [
  ...nest({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['eslint.config.js'] },
];
