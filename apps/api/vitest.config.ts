import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Two projects share one config: `unit` (pure classes, no HTTP) and `e2e` (the full Nest app over
 * HTTP via supertest). Coverage is measured across both. SWC emits Nest's decorator metadata.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    root: './',
    env: { LOG_LEVEL: 'silent' },
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
      { extends: true, test: { name: 'e2e', include: ['test/**/*.e2e-spec.ts'] } },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
