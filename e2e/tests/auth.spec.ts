import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  confirmEmail,
  E2E_PASSWORD,
  fillRegistration,
  logInWithPassword,
  newEmail,
  register,
  REGISTER_UK,
  SIGN_IN_UK,
  signIn,
  VERIFY_UK,
} from '../support/auth.js';
import { latestAuthLink, messageIds } from '../support/mailpit.js';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const T = {
  ...SIGN_IN_UK,
  logout: 'Вийти',
  appTitle: 'Колекції',
  settings: 'Акаунт',
  back: 'До колекцій',
  invalid: VERIFY_UK.invalid,
  invalidTitle: VERIFY_UK.invalidTitle,
  newLink: 'Увійти й отримати новий лист',
};

const NEW_PASSWORD = 'Nov1y-parol!';

test('register → confirm: opening the link twice does not use it up; then password sign-in', async ({
  page,
}) => {
  const email = newEmail();
  const link = await register(page, email);

  // Not confirmed yet: the right password asks to confirm the address.
  await page.goto('/login');
  await page.getByLabel(T.email).fill(email);
  await page.getByLabel(T.password, { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: T.submit, exact: true }).click();
  await expect(page.getByRole('heading', { name: VERIFY_UK.title })).toBeVisible();

  // A mail scanner (or the user) opening the link twice must not consume it.
  await page.goto(link);
  await expect(page.getByText(email)).toBeVisible();
  await confirmEmail(page, link);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(email)).toBeVisible();

  // Used once, the same link is now invalid.
  await page.goto(link);
  await expect(page.getByText(T.invalid)).toBeVisible();

  // Signed out, the password signs in; a wrong one gets the one answer for both mistakes.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel(T.email).fill(email);
  await page.getByLabel(T.password, { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: T.submit, exact: true }).click();
  await expect(page.getByText(T.invalidCredentials)).toBeVisible();
  await logInWithPassword(page, email);
  await expect(page).toHaveURL(/\/app$/);
});

test('the meter says what is missing; «Створити акаунт» needs the rules and the match', async ({
  page,
}) => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: REGISTER_UK.title })).toBeVisible();
  const password = page.getByLabel(REGISTER_UK.password, { exact: true });
  const meter = page.getByRole('meter');
  await password.fill('abc');
  // Not colour alone: the checklist names every rule and its state.
  await expect(meter).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByText('Щонайменше 8 символів').first()).toBeVisible();
  await password.fill('Abcdefg1!');
  await expect(meter).toHaveAttribute('aria-valuenow', '5');
  await page.getByLabel(REGISTER_UK.confirm).fill('Abcdefg1?');
  await page.getByLabel(REGISTER_UK.email).click();
  await expect(page.getByText('Паролі не збігаються')).toBeVisible();
});

test('«Забули пароль?» → the mailed link sets a new password, ends the other session, works once', async ({
  page,
  browser,
}) => {
  const email = newEmail();
  await signIn(page, email);
  const other = await (await browser.newContext({ locale: 'de-DE' })).newPage();
  const seen = await messageIds(email);
  await other.goto('/login');
  await other.getByRole('link', { name: T.forgot }).click();
  await expect(other).toHaveURL(/\/forgot-password$/);
  await other.getByLabel(T.email).fill(email);
  const send = other.getByRole('button', { name: 'Надіслати посилання' });
  await expect(send).toBeEnabled({ timeout: 20_000 });
  await send.click();
  await expect(other.getByRole('heading', { name: 'Перевірте пошту' })).toBeVisible();
  const link = await latestAuthLink(email, 'reset', 15_000, seen);

  await other.goto(link);
  await other.getByLabel('Новий пароль', { exact: true }).fill(NEW_PASSWORD);
  await other.getByLabel('Підтвердіть новий пароль').fill(NEW_PASSWORD);
  await other.getByRole('button', { name: 'Зберегти й увійти' }).click();
  await expect(other).toHaveURL(/\/app$/);

  // The first browser's session ended with the reset.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
  await logInWithPassword(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/app$/);
  // The link is single-use.
  await other.goto(link);
  await other.getByLabel('Новий пароль', { exact: true }).fill(E2E_PASSWORD);
  await other.getByLabel('Підтвердіть новий пароль').fill(E2E_PASSWORD);
  await other.getByRole('button', { name: 'Зберегти й увійти' }).click();
  await expect(other.getByText(T.invalid)).toBeVisible();
  await other.context().close();
});

test('«Акаунт» → «Пароль»: the current one is required, then the new one signs in', async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await page.goto('/app/account');
  await page.getByLabel('Поточний пароль').fill(NEW_PASSWORD);
  await page.getByLabel('Новий пароль', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Підтвердіть новий пароль').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Змінити пароль' }).click();
  await expect(page.getByText('Поточний пароль невірний.')).toBeVisible();
  await page.getByLabel('Поточний пароль').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Змінити пароль' }).click();
  await expect(page.locator('[data-slot="toast-title"]')).toHaveText('Пароль змінено');
  await page.context().clearCookies();
  await logInWithPassword(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/app$/);
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
  await confirmEmail(page, await register(page, email));
  await page.context().clearCookies();
  await page.goto('/login');
  const field = page.getByLabel(T.email);
  const password = page.getByLabel(T.password, { exact: true });
  const focused = (locator: typeof field) =>
    locator.evaluate((el) => el === document.activeElement);
  // Tab from the start of the page to the email field.
  for (let i = 0; i < 10 && !(await focused(field)); i++) await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  await page.keyboard.type(email);
  // On past «Забули пароль?» to the password.
  for (let i = 0; i < 4 && !(await focused(password)); i++) await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await page.keyboard.type(E2E_PASSWORD);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app$/);
});

test('the registration form works with the keyboard only', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard navigation is a desktop concern');
  await fillRegistration(page, newEmail());
  const submit = page.getByRole('button', { name: REGISTER_UK.submit });
  await submit.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: REGISTER_UK.sent })).toBeVisible();
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
