import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { latestAuthLink, messageIds } from './mailpit.js';

/** The acceptance sentence; each document link carries a screen-reader new-tab note. */
const NEW_TAB_UK = '(відкриється в новій вкладці)';
const LEGAL_SENTENCE_UK = `Я приймаю Умови використання ${NEW_TAB_UK} та Політику конфіденційності ${NEW_TAB_UK}`;

/** Ukrainian sign-in copy (ADR 0019): callers run with an unsupported browser language (`de-DE`). */
export const SIGN_IN_UK = {
  title: 'Увійдіть у Stepler',
  email: 'Електронна пошта',
  password: 'Пароль',
  submit: 'Увійти',
  forgot: 'Забули пароль?',
  register: 'Зареєструватися',
  invalidCredentials: 'Невірна пошта або пароль.',
};

/** The registration card (`/register`). */
export const REGISTER_UK = {
  title: 'Створіть акаунт',
  email: 'Електронна пошта',
  password: 'Пароль',
  confirm: 'Підтвердіть пароль',
  submit: 'Створити акаунт',
  sent: 'Перевірте пошту',
  /** The required checkbox on the card (ADR 0016); its name is the whole sentence. */
  legal: LEGAL_SENTENCE_UK,
};

/** The confirmation landing (`/auth/verify`). */
export const VERIFY_UK = {
  title: 'Підтвердіть пошту',
  submit: 'Підтвердити пошту',
  invalid: 'Посилання недійсне, уже використане або застаріло. Отримайте нове.',
  invalidTitle: 'Посилання не спрацювало',
};

/** The fallback page (`/accept-terms`), for accounts without an acceptance. */
export const ACCEPT_TERMS_UK = {
  title: 'Прийміть умови, щоб продовжити',
  checkbox: LEGAL_SENTENCE_UK,
  submit: 'Прийняти і продовжити',
};

/** Every e2e account's password: it meets all five rules. */
export const E2E_PASSWORD = 'E2e-Pa55word!';

/** Ticks the registration card's legal checkbox; «Створити акаунт» stays disabled until then. */
export async function acceptLegalOnCard(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: REGISTER_UK.legal }).check();
}

export const newEmail = (): string => `e2e-${randomUUID()}@stepler.test`;

/** Fills `/register` up to a submit that is ready (Turnstile's always-pass test key). */
export async function fillRegistration(
  page: Page,
  email: string,
  password: string = E2E_PASSWORD,
): Promise<void> {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: REGISTER_UK.title })).toBeVisible();
  await page.getByLabel(REGISTER_UK.email).fill(email);
  await page.getByLabel(REGISTER_UK.password, { exact: true }).fill(password);
  await page.getByLabel(REGISTER_UK.confirm).fill(password);
  await acceptLegalOnCard(page);
  await expect(page.getByRole('button', { name: REGISTER_UK.submit })).toBeEnabled({
    timeout: 20_000,
  });
}

/** Registers through `/register` and returns the confirmation link from Mailpit. */
export async function register(
  page: Page,
  email: string,
  password: string = E2E_PASSWORD,
): Promise<string> {
  const seen = await messageIds(email);
  await fillRegistration(page, email, password);
  await page.getByRole('button', { name: REGISTER_UK.submit }).click();
  await expect(page.getByRole('heading', { name: REGISTER_UK.sent })).toBeVisible();
  return latestAuthLink(email, 'verify', 15_000, seen);
}

/** Opens a confirmation link and confirms: the account is signed in. */
export async function confirmEmail(page: Page, link: string): Promise<void> {
  await page.goto(link);
  await page.getByRole('button', { name: VERIFY_UK.submit }).click();
  await page.waitForURL(/\/(app|accept-terms)$/);
}

/** Signs in through `/login` with the e-mail and password. */
export async function logInWithPassword(
  page: Page,
  email: string,
  password: string = E2E_PASSWORD,
): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: SIGN_IN_UK.title })).toBeVisible();
  await page.getByLabel(SIGN_IN_UK.email).fill(email);
  await page.getByLabel(SIGN_IN_UK.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: SIGN_IN_UK.submit, exact: true }).click();
  await page.waitForURL(/\/(app|accept-terms)$/);
}

/**
 * Accepts on `/accept-terms` when the app sends the account there. A registration records the
 * acceptance, so this should not happen; it keeps a journey going if the fallback ever appears.
 */
export async function acceptTermsIfAsked(page: Page): Promise<void> {
  if (!/\/accept-terms$/.test(new URL(page.url()).pathname)) return;
  await page.getByRole('checkbox', { name: ACCEPT_TERMS_UK.checkbox }).check();
  await page.getByRole('button', { name: ACCEPT_TERMS_UK.submit }).click();
}

/**
 * Signs in as `email` with `E2E_PASSWORD`. An address with an account (the operator's slots,
 * reused within a run) logs in through the API — the UI login is covered by `auth.spec.ts`; a
 * new one registers through `/register` and confirms its mail.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  const origin = String(test.info().project.use.baseURL);
  const login = await page.request.post('/api/v1/auth/login', {
    data: { email, password: E2E_PASSWORD },
    headers: { origin },
  });
  if (login.ok()) {
    // The session cookie is in the context's jar now.
    await page.goto('/app');
  } else {
    await confirmEmail(page, await register(page, email));
  }
  await acceptTermsIfAsked(page);
  await expect(page).toHaveURL(/\/app$/);
  // The top bar says who is signed in (on phones the address is for screen readers only).
  await expect(page.locator('[data-slot="account-block"]')).toContainText(email);
}
