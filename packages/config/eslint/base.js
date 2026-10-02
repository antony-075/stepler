import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Shared TypeScript baseline with type-aware rules.
 * @param {{ tsconfigRootDir: string }} options directory of the consuming package's tsconfig.json
 * @returns {import('eslint').Linter.Config[]}
 */
export default function base({ tsconfigRootDir }) {
  return [
    {
      ignores: [
        '**/dist/**',
        '**/dist-e2e/**',
        '**/.next/**',
        '**/coverage/**',
        '**/storybook-static/**',
        '**/generated/**',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      },
    },
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      ...tseslint.configs.disableTypeChecked,
    },
    prettier,
  ];
}
