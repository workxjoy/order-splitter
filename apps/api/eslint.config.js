import { createBaseConfig } from '@order-splitter/eslint-config/base';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // Nest modules are intentionally empty decorated classes.
    files: ['src/**/*.module.ts'],
    rules: { '@typescript-eslint/no-extraneous-class': 'off' },
  },
]);
