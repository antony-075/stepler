import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compiles decorators with metadata for Nest DI (ADR 0005).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e.spec.ts'],
  },
});
