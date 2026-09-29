import nextPlugin from '@next/eslint-plugin-next';
import react from './react.js';

/**
 * Next.js preset.
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import('eslint').Linter.Config[]}
 */
export default function next(options) {
  return [...react(options), nextPlugin.configs['core-web-vitals']];
}
