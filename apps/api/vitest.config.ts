import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compiles decorators with metadata for Nest DI (ADR 0005).
const plugins = [swc.vite({ module: { type: 'es6' } })];

export default defineConfig({
  test: {
    projects: [
      { plugins, test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
      {
        plugins,
        test: {
          name: 'integration',
          include: ['test/**/*.spec.ts'],
          // Files share the test database and truncate it; run them one at a time.
          fileParallelism: false,
          globalSetup: ['test/support/global-setup.ts'],
        },
      },
    ],
  },
});
