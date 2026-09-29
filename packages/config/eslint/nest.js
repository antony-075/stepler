import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import globals from 'globals';
import base from './base.js';

/**
 * NestJS preset. Guards ESM + decorator pitfalls (ADR 0005):
 * circular imports fail at class definition, and type-only imports of injected
 * classes break DI metadata. Type information lets consistent-type-imports see
 * emitDecoratorMetadata from tsconfig.
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import('eslint').Linter.Config[]}
 */
export default function nest(options) {
  return [
    ...base(options),
    {
      plugins: { 'import-x': importX },
      languageOptions: {
        globals: globals.node,
        parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
      },
      settings: {
        ...importX.flatConfigs.typescript.settings,
        // Replace the legacy resolver from the typescript preset with the resolver-next API.
        'import-x/resolver': undefined,
        'import-x/resolver-next': [
          createTypeScriptImportResolver({ project: options.tsconfigRootDir }),
        ],
      },
      rules: {
        'import-x/no-cycle': 'error',
      },
    },
  ];
}
