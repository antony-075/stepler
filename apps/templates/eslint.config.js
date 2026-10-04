import base from '@stepler/config/eslint/base';
import { boundaries } from './eslint.boundaries.js';

export default [
  ...base({ tsconfigRootDir: import.meta.dirname }),
  ...boundaries(),
  { ignores: ['eslint.config.js', 'eslint.boundaries.js'] },
];
