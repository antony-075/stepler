import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { newEmail, requestLink, SIGN_IN_UK, signIn } from '../support/auth.js';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const T = {
  ...SIGN_IN_UK,
  logout: 'Вийти',
  collections: 'Колекції',
  menu: 'Меню',
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
  const email = newEmail();
  await signIn(page, email);
  await page.getByRole('button', { name: email }).click();
  await page.getByRole('menuitem', { name: T.logout }).click();
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

test('the account menu works with the keyboard only', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard navigation is a desktop concern');
  const email = newEmail();
  await signIn(page, email);
  const trigger = page.getByRole('button', { name: email });
  // Tab from the start of the page to the account menu.
  for (let i = 0; i < 10 && !(await trigger.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  const logout = page.getByRole('menuitem', { name: T.logout });
  await expect(logout).toBeVisible();
  for (let i = 0; i < 10 && !(await logout.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(logout).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/login$/);
});

test('a 60-character email fits a 360px header, truncated (Review Focus 5)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const email = `e2e-longer-${randomUUID()}@stepler.test`;
  expect(email).toHaveLength(60);
  await signIn(page, email);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
  const trigger = page.getByRole('button', { name: email });
  const text = trigger.locator('span[title]');
  await expect(text).toHaveAttribute('title', email);
  // Only the text is cut: the button itself stays inside the page.
  expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const box = await trigger.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  // The menu shows the whole address and fits too.
  await trigger.click();
  await expect(page.getByRole('menu').getByText(email)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
});

test('the admin nav marks the current section', async ({ page }) => {
  await signIn(page, newEmail());
  const wide = page.viewportSize()!.width >= 768;
  const link = wide
    ? page.getByRole('navigation').getByRole('link', { name: T.collections })
    : page.getByRole('menuitem', { name: T.collections });
  if (!wide) await page.getByRole('button', { name: T.menu }).click();
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(link).toHaveAttribute('href', '/app');
});
