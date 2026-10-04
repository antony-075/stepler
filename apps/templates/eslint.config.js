import react from '@stepler/config/eslint/react';
import { boundaries } from './eslint.boundaries.js';

export default [
  ...react({ tsconfigRootDir: import.meta.dirname }),
  ...boundaries(),
  {
    // Fixture models carry their own sample copy (stories only); templates themselves never do.
    files: ['src/fixtures/**/*.{ts,tsx}'],
    rules: { 'react/jsx-no-literals': 'off', 'no-restricted-syntax': 'off' },
  },
  { ignores: ['eslint.config.js', 'eslint.boundaries.js', 'storybook-static/**'] },
];
