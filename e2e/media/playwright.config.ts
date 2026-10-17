import { defineConfig } from '@playwright/test';

/**
 * The landing's product media (`pnpm landing:media`, e2e/media/README.md): one long run against
 * an already running local app (`pnpm dev` + `pnpm worker:dev`), never the e2e servers.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'landing-media.spec.ts',
  workers: 1,
  timeout: 60 * 60_000,
  reporter: 'list',
  outputDir: '../test-results/landing-media/playwright',
  use: {
    baseURL: process.env.LANDING_MEDIA_BASE_URL ?? 'http://localhost:3000',
    browserName: 'chromium',
    // A missing control fails fast instead of waiting out the hour.
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
});
