import { expect, type Page, type Request, test } from '@playwright/test';
import { newEmail, SIGN_IN_UK, signIn } from '../support/auth.js';
import { latestMagicLink, mailSubjects } from '../support/mailpit.js';

// Ukrainian UI to start with (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const EN = {
  loginTitle: 'Sign in or create an account',
  email: 'Email',
  submit: 'Get sign-in link',
  sent: 'Check your email',
  appTitle: 'Your collections',
  subject: 'Sign in to Stepler',
};
const UK_APP_TITLE = 'Ваші колекції';

const switchToEnglish = (page: Page) =>
  page.getByRole('radiogroup', { name: 'Мова', exact: true }).getByRole('radio', { name: 'EN' });

/** On /app the language is in the account menu, whose trigger is the admin's email. */
async function chooseInAccountMenu(page: Page, email: string, language: 'English' | 'Українська') {
  await page.getByRole('button', { name: email }).click();
  await page.getByRole('menuitemradio', { name: language, exact: true }).click();
}

type TurnstileCounters = { renders: number; resets: number; removes: number };

/** Counts widget re-renders, resets and removals from now on (any of them drops the token). */
async function watchTurnstile(page: Page): Promise<() => Promise<TurnstileCounters>> {
  await page.evaluate(() => {
    type Api = Record<'render' | 'reset' | 'remove', (...args: unknown[]) => unknown>;
    const api = (window as unknown as { turnstile: Api }).turnstile;
    const counters = { renders: 0, resets: 0, removes: 0 };
    (window as unknown as { turnstileCounters: TurnstileCounters }).turnstileCounters = counters;
    const wrap = (name: keyof Api, counter: keyof TurnstileCounters) => {
      const original = api[name].bind(api);
      api[name] = (...args) => {
        counters[counter]++;
        return original(...args);
      };
    };
    wrap('render', 'renders');
    wrap('reset', 'resets');
    wrap('remove', 'removes');
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { turnstileCounters: TurnstileCounters }).turnstileCounters,
    );
}

test('switching language mid-form keeps the email and the Turnstile token (Review Focus 2)', async ({
  page,
}) => {
  const email = newEmail();
  await page.goto('/login');
  await page.getByLabel(SIGN_IN_UK.email).fill(email);
  await expect(page.getByRole('button', { name: SIGN_IN_UK.submit })).toBeEnabled({
    timeout: 20_000,
  });
  const turnstile = await watchTurnstile(page);

  await switchToEnglish(page).click();

  await expect(page.getByRole('heading', { name: EN.loginTitle })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByLabel(EN.email)).toHaveValue(email);
  const submit = page.getByRole('button', { name: EN.submit });
  await expect(submit).toBeEnabled();
  expect(await turnstile()).toEqual({ renders: 0, resets: 0, removes: 0 });
  expect((await page.context().cookies()).find((c) => c.name === 'st_locale')?.value).toBe('en');

  // The token that survived the switch is still accepted, and the email follows the new language.
  await submit.click();
  await expect(page.getByRole('heading', { name: EN.sent })).toBeVisible();
  await latestMagicLink(email);
  expect((await mailSubjects(email))[0]).toBe(EN.subject);
});

test('a signed-in admin switches to English: it persists and emails follow', async ({
  page,
  context,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await expect(page.getByRole('heading', { name: UK_APP_TITLE })).toBeVisible();

  await chooseInAccountMenu(page, email, 'English');
  await expect(page.getByRole('heading', { name: EN.appTitle })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: EN.appTitle })).toBeVisible();

  // Signed out, with no locale cookie and a Ukrainian page, the profile still picks the email
  // language.
  await context.clearCookies();
  await page.goto('/login');
  await page.getByLabel(SIGN_IN_UK.email).fill(email);
  const submit = page.getByRole('button', { name: SIGN_IN_UK.submit });
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await submit.click();
  await expect(page.getByRole('heading', { name: SIGN_IN_UK.sent })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: EN.appTitle })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect((await context.cookies()).find((c) => c.name === 'st_locale')?.value).toBe('en');
});

test('/login and /app fit a 360px screen in both languages', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.goto('/login');
  expect(await overflow()).toBeLessThanOrEqual(0);
  await switchToEnglish(page).click();
  await expect(page.getByRole('heading', { name: EN.loginTitle })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.context().clearCookies();
  const email = newEmail();
  await signIn(page, email);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await chooseInAccountMenu(page, email, 'English');
  await expect(page.getByRole('heading', { name: EN.appTitle })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('a failed profile save shows a toast and still switches the page', async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await page.route('**/api/v1/me', (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  );
  await chooseInAccountMenu(page, email, 'English');
  await expect(page.getByRole('heading', { name: EN.appTitle })).toBeVisible();
  // The toast is worded in whichever language was loaded when the save failed.
  await expect(page.locator('[data-slot="toast-title"]')).toHaveText(
    /Couldn't save the language|Не вдалося зберегти мову/,
  );
});

test('quick switches save in order, so the profile ends on the last choice', async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
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

  await chooseInAccountMenu(page, email, 'English');
  await expect.poll(() => events).toEqual(['send en']);
  await chooseInAccountMenu(page, email, 'Українська');
  release();

  await expect.poll(() => events).toEqual(['send en', 'done en', 'send uk', 'done uk']);
  const me = await page.request.get('/api/v1/me');
  expect(((await me.json()) as { locale: string }).locale).toBe('uk');
  await expect(page.getByRole('heading', { name: UK_APP_TITLE })).toBeVisible();
});
