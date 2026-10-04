import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { newEmail, requestLink, SIGN_IN_UK, signIn } from '../support/auth.js';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const T = {
  ...SIGN_IN_UK,
  logout: 'Вийти',
  appTitle: 'Колекції',
  settings: 'Акаунт',
  back: 'До колекцій',
  invalid: 'Посилання недійсне або вже використане. Отримайте нове.',
  invalidTitle: 'Посилання не спрацювало',
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
  await page.getByRole('button', { name: T.logout }).click();
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
  await expect(page.getByRole('heading', { level: 1, name: T.invalidTitle })).toBeVisible();
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
  const submit = page.getByRole('button', { name: T.submit });
  const legal = page.getByRole('checkbox', { name: T.legal });
  const focused = (locator: typeof field) =>
    locator.evaluate((el) => el === document.activeElement);
  // Unticked, the submit stays disabled whatever Turnstile does (ADR 0016).
  await expect(submit).toBeDisabled();
  // Tab from the start of the page to the email field.
  for (let i = 0; i < 10 && !(await focused(field)); i++) await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  await page.keyboard.type(email);
  // Tab on to the checkbox, which comes before the submit.
  for (let i = 0; i < 6 && !(await focused(legal)); i++) await page.keyboard.press('Tab');
  await expect(legal).toBeFocused();
  await page.keyboard.press('Space');
  await expect(legal).toBeChecked();
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  // Past the sentence's two document links to the submit.
  for (let i = 0; i < 4 && !(await focused(submit)); i++) await page.keyboard.press('Tab');
  await expect(submit).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: T.sent })).toBeVisible();
});

test('«Вийти» works with the keyboard only', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard navigation is a desktop concern');
  await signIn(page, newEmail());
  const logout = page.getByRole('button', { name: T.logout });
  for (let i = 0; i < 12 && !(await logout.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
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
  // On a phone: the avatar initial and an icon «Вийти» named by its label, inside the screen.
  const block = page.locator('[data-slot="account-block"]');
  await expect(block.locator('[aria-hidden="true"]').first()).toHaveText('E');
  const logout = block.getByRole('button', { name: T.logout });
  const box = await logout.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);

  // From md the address is shown, truncated with a title, and nothing leaves the bar.
  await page.setViewportSize({ width: 768, height: 1024 });
  const text = block.getByText(email);
  await expect(text).toBeVisible();
  await expect(text).toHaveAttribute('title', email);
  expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const wide = await block.boundingBox();
  expect(wide!.x + wide!.width).toBeLessThanOrEqual(768);
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('a name set on «Акаунт» shows in the header above the email', async ({ page, isMobile }) => {
  const email = newEmail();
  await signIn(page, email);
  const block = page.locator('[data-slot="account-block"]');
  // No name yet: the email alone, the avatar its first letter.
  await expect(block.locator('[aria-hidden="true"]').first()).toHaveText('E');

  await page.goto('/app/account');
  const profile = page.getByRole('form', { name: 'Профіль' });
  const field = profile.getByRole('textbox', { name: 'Ім’я' });
  await expect(field).toHaveValue('');
  const save = profile.getByRole('button', { name: 'Зберегти' });
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await field.fill('Я'.repeat(81));
  await expect(field).toHaveValue('Я'.repeat(80));
  await field.fill('Оля Коваль');
  await save.click();
  await expect(page.locator('[data-slot="toast-title"]')).toHaveText('Ім’я збережено');
  await expect(block.locator('[aria-hidden="true"]').first()).toHaveText('О');
  if (!isMobile) {
    await expect(block.getByText('Оля Коваль')).toBeVisible();
    await expect(block.getByText(email)).toBeVisible();
  }
  await page.reload();
  await expect(field).toHaveValue('Оля Коваль');

  // Cancel puts it back; clearing it saves no name.
  await field.fill('Ольга');
  await profile.getByRole('button', { name: 'Скасувати' }).click();
  await expect(field).toHaveValue('Оля Коваль');
  await field.fill('');
  await save.click();
  await expect(block.locator('[aria-hidden="true"]').first()).toHaveText('E');
  const me = (await (await page.request.get('/api/v1/me')).json()) as { displayName: unknown };
  expect(me.displayName).toBeNull();
});

test('the header has no dropdown; «Акаунт» is in the sidebar', async ({ page, isMobile }) => {
  const email = newEmail();
  await signIn(page, email);
  // The sections are in the sidebar (a sheet on phones), not in the top bar.
  await expect(page.getByRole('banner').getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('button', { name: email })).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('button', { name: T.logout })).toBeVisible();

  if (isMobile) await page.getByRole('button', { name: 'Відкрити меню' }).click();
  await page
    .getByRole('navigation', { name: 'Розділи' })
    .getByRole('link', { name: T.settings })
    .click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(page.getByRole('heading', { name: T.settings, level: 1 })).toBeVisible();

  // No back link on «Акаунт» (the sidebar is the navigation): «Колекції» returns.
  await expect(page.getByRole('main').getByRole('link', { name: T.back })).toHaveCount(0);
  if (isMobile) await page.getByRole('button', { name: 'Відкрити меню' }).click();
  await page
    .getByRole('navigation', { name: 'Розділи' })
    .getByRole('link', { name: T.appTitle })
    .click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: T.appTitle, level: 1 })).toBeVisible();

  // The brand goes to the collections too, not to the landing page.
  await page.goto('/app/account');
  const brand = page.getByRole('link', { name: 'Stepler' });
  await expect(brand).toHaveAttribute('href', '/app');
  await brand.click();
  await expect(page).toHaveURL(/\/app$/);
});
