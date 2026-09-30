import { expect, test } from '@playwright/test';
import { newEmail, requestLink, SIGN_IN_UK, signIn } from '../support/auth.js';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const T = {
  ...SIGN_IN_UK,
  logout: 'Вийти',
  invalid: 'Посилання недійсне або вже використане. Отримайте нове.',
  newLink: 'Отримати нове посилання',
};

test('magic link: prefetching the link does not use it up (Review Focus 1)', async ({ page }) => {
  const email = newEmail();
  const link = await requestLink(page, email);

  // A mail scanner (or the user) opening the link twice must not consume it.
  await page.goto(link);
  await expect(page.getByText(email)).toBeVisible();
  await page.goto(link);
  await expect(page.getByText(`Ви входите як ${email}`)).toBeVisible();

  await page.getByRole('button', { name: T.signIn }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(email)).toBeVisible();

  // Used once, the same link is now invalid.
  await page.goto(link);
  await expect(page.getByText(T.invalid)).toBeVisible();
});

test('logout ends the session and /app sends you back to /login', async ({ page }) => {
  await signIn(page, newEmail());
  await page.getByRole('button', { name: T.logout }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
});

test('an invalid link shows an error with a way back to /login', async ({ page }) => {
  await page.goto(`/auth/verify?token=${'A'.repeat(43)}`);
  await expect(page.getByText(T.invalid)).toBeVisible();
  await page.getByRole('link', { name: T.newLink }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('/login and /app fit the viewport without horizontal scroll', async ({ page }) => {
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: T.title })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await signIn(page, newEmail());
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('the sign-in form works with the keyboard only', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard navigation is a desktop concern');
  const email = newEmail();
  await page.goto('/login');
  const field = page.getByLabel(T.email);
  await expect(page.getByRole('button', { name: T.submit })).toBeEnabled({ timeout: 20_000 });
  // Tab from the start of the page to the email field.
  for (let i = 0; i < 10 && !(await field.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(field).toBeFocused();
  await page.keyboard.type(email);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: T.sent })).toBeVisible();
});
