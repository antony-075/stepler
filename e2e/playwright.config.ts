import { defineConfig, devices } from '@playwright/test';
import { compose, E2E_DATABASE_URL } from './support/env.js';

// Dedicated ports so e2e never collides with `pnpm dev` (3000/4000).
const API_PORT = 4100;
const WEB_PORT = 3100;

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  // Runs the production builds (turbo builds them first). The API is built into
  // its own dist-e2e so a running `pnpm dev` (which owns apps/api/dist) is never touched.
  webServer: [
    {
      command: 'node ../apps/api/dist-e2e/main.js',
      url: `http://127.0.0.1:${API_PORT}/api/v1/health/live`,
      env: {
        NODE_ENV: 'production',
        API_PORT: String(API_PORT),
        LOG_LEVEL: 'warn',
        APP_ORIGIN: `http://127.0.0.1:${WEB_PORT}`,
        COOKIE_SECURE: 'false',
        // Local compose services; e2e never uses real credentials.
        DATABASE_URL: E2E_DATABASE_URL,
        SMTP_URL: 'smtp://127.0.0.1:1025',
        MAIL_FROM: 'Stepler <no-reply@stepler.test>',
        // Cloudflare's documented always-pass test keys.
        TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
        TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
        APP_SECRET: Buffer.alloc(32, 7).toString('base64'),
        S3_ENDPOINT: 'http://127.0.0.1:8333',
        S3_REGION: 'us-east-1',
        S3_BUCKET: 'stepler-test',
        S3_ACCESS_KEY_ID: compose.S3_ACCESS_KEY_ID ?? 'stepler',
        S3_SECRET_ACCESS_KEY: compose.S3_SECRET_ACCESS_KEY ?? '',
        S3_FORCE_PATH_STYLE: 'true',
        // All e2e traffic comes from 127.0.0.1; per-IP limits are covered by API tests.
        LIMIT_MAGIC_LINK_PER_IP_PER_HOUR: '10000',
        LIMIT_MAGIC_LINK_PREVIEW_PER_IP_PER_HOUR: '10000',
        LIMIT_GUEST_LINK_RESOLVE_PER_IP_PER_MINUTE: '10000',
      },
      reuseExistingServer: false,
    },
    {
      command: 'node ../apps/web/.next/standalone/apps/web/server.js',
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: {
        PORT: String(WEB_PORT),
        HOSTNAME: '127.0.0.1',
        API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`,
      },
      reuseExistingServer: false,
    },
  ],
});
