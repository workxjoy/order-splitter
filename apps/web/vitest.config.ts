import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Two projects share one config: `node` for plain modules (formatting, the form model, the API
 * client, server actions) and `dom` for pages and components rendered with Testing Library in
 * jsdom. Coverage counts every source file, pages and components included.
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    projects: [
      {
        extends: true,
        test: { name: 'node', include: ['src/**/*.spec.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          include: ['src/**/*.spec.tsx'],
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.spec.{ts,tsx}', 'src/test/**'],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
