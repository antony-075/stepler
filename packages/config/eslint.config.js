import base from './eslint/base.js';

export default [
  ...base({ tsconfigRootDir: import.meta.dirname }),
  // Fixtures intentionally violate the presets under test.
  { ignores: ['test/fixtures/**', 'eslint.config.js'] },
];
