import { expect, type Page, type Request, test } from '@playwright/test';
import { newEmail, SIGN_IN_UK, signIn } from '../support/auth.js';
import { mailSubjects } from '../support/mailpit.js';

// Ukrainian UI to start with (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const EN = {
  loginTitle: 'Sign in to Stepler',
  email: 'Email',
  submit: 'Get sign-in link',
  sent: 'Check your email',
  appTitle: 'Collections',
  settings: 'Account',
  subject: 'A new password for Stepler',
};
const UK_APP_TITLE = 'Колекції';

const UK_SETTINGS = 'Акаунт';

/** The language switch is on /app/account: «Акаунт» in the sidebar (the menu sheet on phones). */
async function openSettings(page: Page) {
  const menu = page.getByRole('button', { name: 'Відкрити меню' });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Розділи' })
    .getByRole('link', { name: UK_SETTINGS })
    .click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(page.getByRole('heading', { name: UK_SETTINGS, level: 1 })).toBeVisible();
}

/** Picks a language in the select, whose label is in the current UI language. */
async function choose(page: Page, language: 'English' | 'Українська') {
  await page.getByRole('combobox', { name: /^(Мова|Language)$/ }).click();
  await page.getByRole('option', { name: language, exact: true }).click();
}

test('a signed-in admin switches to English: it persists and emails follow', async ({
  page,
  context,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await expect(page.getByRole('heading', { name: UK_APP_TITLE, level: 1 })).toBeVisible();

  await openSettings(page);
  await choose(page, 'English');
  await expect(page.getByRole('heading', { name: EN.settings, level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: EN.appTitle, level: 1 })).toBeVisible();

  // Signed out, with no locale cookie and a Ukrainian page, the profile still picks the email
  // language.
  await context.clearCookies();
  await page.goto('/forgot-password');
  await page.getByLabel(SIGN_IN_UK.email).fill(email);
  const submit = page.getByRole('button', { name: 'Надіслати посилання' });
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Перевірте пошту' })).toBeVisible();
  await expect.poll(async () => (await mailSubjects(email)).length).toBe(2);
  expect((await mailSubjects(email))[0]).toBe(EN.subject);
});

test('the profile locale wins over the cookie on /app', async ({ page, context, baseURL }) => {
  await signIn(page, newEmail());
  const res = await page.request.patch('/api/v1/me', {
    data: { locale: 'en' },
    headers: { origin: baseURL! },
  });
  expect(res.status()).toBe(200);
  await context.addCookies([{ name: 'st_locale', value: 'uk', url: baseURL! }]);

  await page.goto('/app');
  await expect(page.getByRole('heading', { name: EN.appTitle, level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect((await context.cookies()).find((c) => c.name === 'st_locale')?.value).toBe('en');
});

test('/login and /app fit a 360px screen in both languages', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.goto('/login');
  expect(await overflow()).toBeLessThanOrEqual(0);
  await context.addCookies([{ name: 'st_locale', value: 'en', url: baseURL! }]);
  await page.reload();
  await expect(page.getByRole('heading', { name: EN.loginTitle })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.context().clearCookies();
  const email = newEmail();
  await signIn(page, email);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await openSettings(page);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await choose(page, 'English');
  await expect(page.getByRole('heading', { name: EN.settings, level: 1 })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: EN.appTitle, level: 1 })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('a failed profile save shows a toast and still switches the page', async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await page.route('**/api/v1/me', (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await openSettings(page);
  await choose(page, 'English');
  await expect(page.getByRole('heading', { name: EN.settings, level: 1 })).toBeVisible();
  // The toast is worded in whichever language was loaded when the save failed.
  await expect(page.locator('[data-slot="toast-title"]')).toHaveText(
    /Couldn't save the language|Не вдалося зберегти мову/,
  );
});

test('quick switches save in order, so the profile ends on the last choice', async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await openSettings(page);
  // Sent in parallel, a later choice could reach the server first and an earlier one would win.
  // Holds the first save and records when each save is sent and settles.
  const events: string[] = [];
  const localeOf = (request: Request) => (request.postDataJSON() as { locale: string }).locale;
  const isSave = (request: Request) =>
    request.method() === 'PATCH' && request.url().endsWith('/api/v1/me');
  page.on('request', (r) => isSave(r) && events.push(`send ${localeOf(r)}`));
  page.on('requestfinished', (r) => isSave(r) && events.push(`done ${localeOf(r)}`));
  page.on('requestfailed', (r) => isSave(r) && events.push(`fail ${localeOf(r)}`));
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let first = true;
  await page.route('**/api/v1/me', async (route) => {
    if (!isSave(route.request())) return route.continue();
    if (first) {
      first = false;
      await held;
    }
    return route.continue();
  });

  await choose(page, 'English');
  await expect.poll(() => events).toEqual(['send en']);
  await choose(page, 'Українська');
  release();

  await expect.poll(() => events).toEqual(['send en', 'done en', 'send uk', 'done uk']);
  const me = await page.request.get('/api/v1/me');
  expect(((await me.json()) as { locale: string }).locale).toBe('uk');
  await expect(page.getByRole('heading', { name: UK_SETTINGS, level: 1 })).toBeVisible();
});
