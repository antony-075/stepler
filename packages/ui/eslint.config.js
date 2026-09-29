import react from '@eventdrop/config/eslint/react';

export default [
  ...react({ tsconfigRootDir: import.meta.dirname }),
  { ignores: ['eslint.config.js', 'storybook-static/**'] },
];
