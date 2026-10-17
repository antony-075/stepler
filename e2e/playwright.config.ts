import { defineConfig, devices } from '@playwright/test';
import { compose, E2E_DATABASE_URL, E2E_S3_ENDPOINT, E2E_SMTP_URL } from './support/env.js';
import { E2E_LIQPAY } from './support/billing-env.js';
import { OPERATOR_EMAILS } from './support/operator.js';

// Dedicated ports so e2e never collides with `pnpm dev` (3000/4000); overridable for a second
// stack running at the same time (uploads then need that origin in the bucket's CORS).
const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);

/**
 * Payments on (ADR 0018) with test-only keys: the real `LiqPayProvider` talks to the local stub
 * (`support/liqpay-stub.ts`) instead of LiqPay's server API, and the journeys answer the checkout
 * page with `page.route` (`support/billing.ts`).
 */
const BILLING_ENV = {
  BILLING_PROVIDER: 'liqpay',
  LIQPAY_PUBLIC_KEY: E2E_LIQPAY.publicKey,
  LIQPAY_PRIVATE_KEY: E2E_LIQPAY.privateKey,
  LIQPAY_API_BASE: `http://127.0.0.1:${E2E_LIQPAY.port}`,
};

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: 'retain-on-failure' },
  // Admin-only management journeys are tagged `@desktop` and run on desktop Chrome only; every
  // other test (guest journeys included) runs on all three projects.
  projects: [
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] }, grepInvert: /@desktop/ },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] }, grepInvert: /@desktop/ },
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
        SMTP_URL: E2E_SMTP_URL,
        MAIL_FROM: 'Stepler <no-reply@stepler.test>',
        // The operator's service accounts (slice 9, `support/operator.ts`); the same on the worker.
        OPERATOR_EMAILS,
        LEGAL_CONTACT_EMAIL: 'privacy@stepler.test',
        // Cloudflare's documented always-pass test keys.
        TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
        TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
        APP_SECRET: Buffer.alloc(32, 7).toString('base64'),
        S3_ENDPOINT: E2E_S3_ENDPOINT,
        S3_REGION: 'us-east-1',
        S3_BUCKET: 'stepler-test',
        S3_ACCESS_KEY_ID: compose.S3_ACCESS_KEY_ID ?? 'stepler',
        S3_SECRET_ACCESS_KEY: compose.S3_SECRET_ACCESS_KEY ?? '',
        S3_FORCE_PATH_STYLE: 'true',
        // All e2e traffic comes from 127.0.0.1; per-IP limits are covered by API tests.
        LIMIT_AUTH_EMAILS_PER_IP_PER_HOUR: '10000',
        LIMIT_AUTH_TOKEN_CHECKS_PER_IP_PER_HOUR: '10000',
        // The operator's few service addresses sign in many times per run (slice 9).
        LIMIT_LOGIN_ATTEMPTS_PER_IP_PER_HOUR: '10000',
        LIMIT_AUTH_EMAILS_PER_ADDRESS_PER_HOUR: '10000',
        LIMIT_GUEST_LINK_RESOLVE_PER_IP_PER_MINUTE: '10000',
        LIMIT_GUEST_SESSIONS_PER_IP_PER_MINUTE: '10000',
        LIMIT_TEXTS_PER_IP_PER_MINUTE: '10000',
        LIMIT_GUEST_READS_PER_IP_PER_MINUTE: '10000',
        LIMIT_GUEST_WRITES_PER_IP_PER_MINUTE: '10000',
        LIMIT_REPORTS_PER_IP_PER_HOUR: '10000',
        LIMIT_APPEALS_PER_ACCOUNT_PER_DAY: '10000',
        LIMIT_UPLOAD_CALLS_PER_IP_PER_MINUTE: '10000',
        LIMIT_UPLOAD_CALLS_PER_GUEST_SESSION_PER_MINUTE: '10000',
        LIMIT_ADMIN_COVER_CALLS_PER_IP_PER_MINUTE: '10000',
        LIMIT_ADMIN_COVER_CALLS_PER_USER_PER_MINUTE: '10000',
        ...BILLING_ENV,
        BILLING_CALLBACK_URL: `http://127.0.0.1:${API_PORT}/api/v1/billing/liqpay/callback`,
        LIMIT_BILLING_CALLBACKS_PER_IP_PER_MINUTE: '10000',
        LIMIT_BILLING_CHECKOUTS_PER_USER_PER_HOUR: '10000',
      },
      reuseExistingServer: false,
    },
    // The worker purges deleted content and collections, as on staging. It serves no port, so
    // Playwright waits for its start line instead (LOG_LEVEL info prints it).
    {
      command: 'node ../apps/api/dist-e2e/worker/main.js',
      wait: { stdout: /worker started/ },
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        DATABASE_URL: E2E_DATABASE_URL,
        // The report mail goes to Mailpit, with links to this web origin.
        APP_ORIGIN: `http://127.0.0.1:${WEB_PORT}`,
        SMTP_URL: E2E_SMTP_URL,
        MAIL_FROM: 'Stepler <no-reply@stepler.test>',
        OPERATOR_EMAILS,
        LEGAL_CONTACT_EMAIL: 'privacy@stepler.test',
        S3_ENDPOINT: E2E_S3_ENDPOINT,
        S3_REGION: 'us-east-1',
        S3_BUCKET: 'stepler-test',
        S3_ACCESS_KEY_ID: compose.S3_ACCESS_KEY_ID ?? 'stepler',
        S3_SECRET_ACCESS_KEY: compose.S3_SECRET_ACCESS_KEY ?? '',
        S3_FORCE_PATH_STYLE: 'true',
        ...BILLING_ENV,
      },
      reuseExistingServer: false,
    },
    // LiqPay's server API, stubbed locally (status answers set by the journeys).
    {
      command: 'node support/liqpay-stub.ts',
      url: `http://127.0.0.1:${E2E_LIQPAY.port}/health`,
      env: { E2E_LIQPAY_PORT: String(E2E_LIQPAY.port), LIQPAY_PRIVATE_KEY: E2E_LIQPAY.privateKey },
      reuseExistingServer: false,
    },
    {
      command: 'node ../apps/web/.next/standalone/apps/web/server.js',
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: {
        PORT: String(WEB_PORT),
        HOSTNAME: '127.0.0.1',
        API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`,
        // Placeholder legal texts are allowed everywhere but production ([C20]).
        LEGAL_ALLOW_DRAFT: 'true',
        LEGAL_CONTACT_EMAIL: 'privacy@stepler.test',
      },
      reuseExistingServer: false,
    },
  ],
});
