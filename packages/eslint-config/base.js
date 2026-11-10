import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Type-aware lint preset shared by every Node/TypeScript workspace.
 * @param {{ tsconfigRootDir: string }} options
 */
export function createBaseConfig({ tsconfigRootDir }) {
  return defineConfig([
    globalIgnores(['dist/**', 'coverage/**', '.turbo/**', 'node_modules/**']),
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        globals: globals.node,
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        eqeqeq: ['error', 'always'],
        'no-console': 'error',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/switch-exhaustiveness-check': 'error',
        '@typescript-eslint/prefer-readonly': 'error',
      },
    },
    {
      // HTTP response bodies and mocks are untyped in tests; assertions provide the safety there.
      files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
    {
      files: ['**/*.js', '**/*.mjs'],
      extends: [tseslint.configs.disableTypeChecked],
    },
    prettier,
  ]);
}
