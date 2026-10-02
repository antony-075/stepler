import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { latestMagicLink } from './mailpit.js';

/** Ukrainian sign-in copy: callers run with an unsupported browser language (`de-DE`). */
export const SIGN_IN_UK = {
  title: 'Увійдіть або створіть акаунт',
  email: 'Електронна пошта',
  submit: 'Отримати посилання для входу',
  sent: 'Перевірте пошту',
  signIn: 'Увійти',
};

export const newEmail = (): string => `e2e-${randomUUID()}@stepler.test`;

/** Requests a link through the UI; Turnstile's always-pass test key solves itself. */
export async function requestLink(page: Page, email: string): Promise<string> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: SIGN_IN_UK.title })).toBeVisible();
  await page.getByLabel(SIGN_IN_UK.email).fill(email);
  const submit = page.getByRole('button', { name: SIGN_IN_UK.submit });
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await submit.click();
  await expect(page.getByRole('heading', { name: SIGN_IN_UK.sent })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  return latestMagicLink(email);
}

export async function signIn(page: Page, email: string): Promise<void> {
  const link = await requestLink(page, email);
  await page.goto(link);
  await page.getByRole('button', { name: SIGN_IN_UK.signIn }).click();
  await expect(page).toHaveURL(/\/app$/);
  // The top bar says who is signed in (on phones the address is for screen readers only).
  await expect(page.locator('[data-slot="account-block"]')).toContainText(email);
}
