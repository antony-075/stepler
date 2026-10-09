// Billing constants shared by the Playwright config, the global setup and the journeys; no
// Playwright import here, so the config can load it.

/** Test-only key pair for the journeys; never a real LiqPay key. */
export const E2E_LIQPAY = {
  publicKey: 'sandbox_e2e_public',
  privateKey: 'sandbox_e2e_private_key_for_playwright_only',
  port: Number(process.env.E2E_LIQPAY_PORT ?? 4180),
};

/** The browser posts LiqPay's form here; the journeys answer it with `page.route`. */
export const LIQPAY_CHECKOUT_URL = 'https://www.liqpay.ua/api/3/checkout';

/** UAH prices the e2e catalogue sells (global setup), in kopecks. */
export const E2E_PRICES = {
  'pack-start': 49_900,
  'pack-event': 99_900,
  'ext-window-30': 19_900,
  'ext-retention-365': 29_900,
} as const;

/** The subscription plans' UAH prices in the journeys (M3), in kopecks. */
export const E2E_PLAN_PRICES = {
  'sub-pro': { MONTH: 50_000, YEAR: 500_000 },
  'sub-business': { MONTH: 120_000, YEAR: 1_200_000 },
} as const;
