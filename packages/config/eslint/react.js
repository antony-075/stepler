import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import base from './base.js';

/** A string literal (not a number/boolean), e.g. 'x' or "x". */
const STRING = 'Literal[raw=/^["\']/]';
/** Result branches of logical/conditional expressions (not their test operands). */
const BRANCH = ':matches(LogicalExpression, ConditionalExpression)';

/** Attributes whose values are read by users or assistive technology. */
const USER_FACING_ATTRIBUTE =
  /^(aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext|title|alt|placeholder)$/;

/**
 * Plugin-provided configs. eslint-plugin-react types its flat configs as possibly undefined;
 * they always exist at runtime.
 * @type {import('eslint').Linter.Config[]}
 */
const PLUGIN_CONFIGS = /** @type {import('eslint').Linter.Config[]} */ ([
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  reactHooks.configs.flat['recommended-latest'],
  jsxA11y.flatConfigs.recommended,
]);

/**
 * React preset. User-facing text must come from translations (ADR 0011).
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import('eslint').Linter.Config[]}
 */
export default function react(options) {
  return [
    ...base(options),
    ...PLUGIN_CONFIGS,
    {
      languageOptions: { globals: globals.browser },
      settings: { react: { version: 'detect' } },
      rules: {
        'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
        'no-restricted-syntax': [
          'error',
          {
            selector: `JSXAttribute[name.name=${USER_FACING_ATTRIBUTE}] > Literal`,
            message: 'User-facing attribute must use a translation.',
          },
          {
            selector: `JSXAttribute[name.name=${USER_FACING_ATTRIBUTE}] > JSXExpressionContainer > :matches(${STRING}, TemplateLiteral)`,
            message: 'User-facing attribute must use a translation.',
          },
          {
            selector: `JSXAttribute[name.name=${USER_FACING_ATTRIBUTE}] ${BRANCH} > :matches(${STRING}, TemplateLiteral)`,
            message: 'User-facing attribute must use a translation.',
          },
          {
            // jsx-no-literals misses strings that are a branch of `a || 'x'` / `c ? 'x' : 'y'`.
            selector: `:matches(JSXElement, JSXFragment) > JSXExpressionContainer ${BRANCH} > :matches(${STRING}, TemplateLiteral)`,
            message: 'User-facing text must use a translation.',
          },
        ],
      },
    },
    {
      files: ['**/*.stories.tsx', '**/*.test.tsx', '**/*.spec.tsx'],
      rules: { 'react/jsx-no-literals': 'off', 'no-restricted-syntax': 'off' },
    },
  ];
}
