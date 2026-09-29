import { defineConfig, devices } from '@playwright/test';

// Dedicated ports so e2e never collides with `pnpm dev` (3000/4000).
const API_PORT = 4100;
const WEB_PORT = 3100;

export default defineConfig({
  testDir: './tests',
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
  // Runs the production builds (turbo builds them first via ^build).
  webServer: [
    {
      command: 'node ../apps/api/dist/main.js',
      url: `http://127.0.0.1:${API_PORT}/api/v1/health/live`,
      env: { NODE_ENV: 'production', API_PORT: String(API_PORT), LOG_LEVEL: 'warn' },
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
