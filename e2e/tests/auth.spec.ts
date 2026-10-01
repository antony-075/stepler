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

test('a signed-out visit to /app is redirected to /login by the server', async ({ page }) => {
  const res = await page.request.get('/app', { maxRedirects: 0 });
  expect([307, 308]).toContain(res.status());
  expect(new URL(res.headers()['location']!, 'http://x').pathname).toBe('/login');

  // The browser's navigation is redirected before any of the shell renders.
  const landed = await page.goto('/app');
  expect(new URL(landed!.url()).pathname).toBe('/login');
  const first = landed!.request().redirectedFrom();
  expect(first && new URL(first.url()).pathname).toBe('/app');
  expect([307, 308]).toContain((await first!.response())!.status());
  await expect(page.getByRole('heading', { name: T.title })).toBeVisible();
});

test('a signed-in visit to / or /login goes to /app; /auth/verify does not', async ({ page }) => {
  await signIn(page, newEmail());
  for (const path of ['/', '/login']) {
    const res = await page.request.get(path, { maxRedirects: 0 });
    expect([307, 308]).toContain(res.status());
    expect(new URL(res.headers()['location']!, 'http://x').pathname).toBe('/app');
    await page.goto(path);
    await expect(page).toHaveURL(/\/app$/);
  }
  // A link may be for another account: the verify page stays, here with its invalid-link error.
  await page.goto(`/auth/verify?token=${'A'.repeat(43)}`);
  await expect(page.getByText(T.invalid)).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/verify\?token=/);
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

test('a 60-character email fits the header, truncated (Review Focus 5)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const email = `e2e-longer-${randomUUID()}@stepler.test`;
  expect(email).toHaveLength(60);
  await signIn(page, email);
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  // On a phone the trigger is the avatar initial; the address stays its accessible name.
  const trigger = page.getByRole('button', { name: email });
  await expect(trigger).toHaveText(/^E/);
  const box = await trigger.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  // The menu shows the whole address (truncated with a title) and fits too.
  await trigger.click();
  const full = page.getByRole('menu').getByText(email);
  await expect(full).toBeVisible();
  await expect(full).toHaveAttribute('title', email);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.keyboard.press('Escape');

  // From md the address is shown, cut to 26ch: only the text is cut, the button stays inside.
  await page.setViewportSize({ width: 768, height: 1024 });
  const text = trigger.locator('span[title]');
  await expect(text).toBeVisible();
  await expect(text).toHaveAttribute('title', email);
  expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const wide = await trigger.boundingBox();
  expect(wide!.x + wide!.width).toBeLessThanOrEqual(768);
  expect(await overflow()).toBeLessThanOrEqual(0);
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
