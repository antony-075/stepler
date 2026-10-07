import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { latestMagicLink, messageIds } from './mailpit.js';

/** The acceptance sentence; each document link carries a screen-reader new-tab note. */
const NEW_TAB_UK = '(відкриється в новій вкладці)';
const LEGAL_SENTENCE_UK = `Я приймаю Умови використання ${NEW_TAB_UK} та Політику конфіденційності ${NEW_TAB_UK}`;

/** Ukrainian sign-in copy: callers run with an unsupported browser language (`de-DE`). */
export const SIGN_IN_UK = {
  title: 'Увійдіть або створіть акаунт',
  email: 'Електронна пошта',
  submit: 'Отримати посилання для входу',
  sent: 'Перевірте пошту',
  signIn: 'Увійти',
  /** The required checkbox on the card (ADR 0016); its name is the whole sentence. */
  legal: LEGAL_SENTENCE_UK,
};

/** The fallback page (`/accept-terms`), for accounts without an acceptance. */
export const ACCEPT_TERMS_UK = {
  title: 'Прийміть умови, щоб продовжити',
  checkbox: LEGAL_SENTENCE_UK,
  submit: 'Прийняти і продовжити',
};

/** Ticks the sign-in card's legal checkbox; both sign-in buttons stay disabled until then. */
export async function acceptLegalOnCard(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: SIGN_IN_UK.legal }).check();
}

export const newEmail = (): string => `e2e-${randomUUID()}@stepler.test`;

/** Requests a link through the UI; Turnstile's always-pass test key solves itself. */
export async function requestLink(page: Page, email: string): Promise<string> {
  // A reused address (the operator's) has older, used links in Mailpit: wait for a new one.
  const seen = await messageIds(email);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: SIGN_IN_UK.title })).toBeVisible();
  await page.getByLabel(SIGN_IN_UK.email).fill(email);
  await acceptLegalOnCard(page);
  const submit = page.getByRole('button', { name: SIGN_IN_UK.submit });
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await submit.click();
  await expect(page.getByRole('heading', { name: SIGN_IN_UK.sent })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  return latestMagicLink(email, 15_000, seen);
}

/**
 * Accepts on `/accept-terms` when the app sends the account there. A card sign-in records the
 * acceptance, so this should not happen; it keeps a journey going if the fallback ever appears.
 */
export async function acceptTermsIfAsked(page: Page): Promise<void> {
  if (!/\/accept-terms$/.test(new URL(page.url()).pathname)) return;
  await page.getByRole('checkbox', { name: ACCEPT_TERMS_UK.checkbox }).check();
  await page.getByRole('button', { name: ACCEPT_TERMS_UK.submit }).click();
}

export async function signIn(page: Page, email: string): Promise<void> {
  const link = await requestLink(page, email);
  await page.goto(link);
  await page.getByRole('button', { name: SIGN_IN_UK.signIn }).click();
  await page.waitForURL(/\/(app|accept-terms)$/);
  await acceptTermsIfAsked(page);
  await expect(page).toHaveURL(/\/app$/);
  // The top bar says who is signed in (on phones the address is for screen readers only).
  await expect(page.locator('[data-slot="account-block"]')).toContainText(email);
}
