import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';

// Ukrainian UI (no supported browser language → default locale). The theme switch is on
// /app/settings; public pages have none, so anonymous tests set the `st_theme` cookie directly.
test.use({ locale: 'de-DE', viewport: { width: 1024, height: 768 } });

const DARK_BACKGROUND = 'rgb(19, 20, 27)';
const LIGHT_BACKGROUND = 'rgb(244, 244, 247)';
const T = { group: 'Тема', light: 'Світла', dark: 'Темна', system: 'Системна' };

async function setThemeCookie(context: BrowserContext, baseURL: string, value: string) {
  await context.addCookies([{ name: 'st_theme', value, url: baseURL }]);
}

const bodyBackground = (page: Page) =>
  page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor);

/** The theme select, named by its row label. */
const themeSelect = (page: Page, label = T.group) =>
  page.getByRole('combobox', { name: label, exact: true });

async function choose(page: Page, select: string, option: string) {
  await page.getByRole('combobox', { name: select, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

async function openSettings(page: Page) {
  await signIn(page, newEmail());
  await page.goto('/app/settings');
  await expect(page.getByRole('heading', { name: 'Налаштування', level: 1 })).toBeVisible();
}

test.describe('on a light OS', () => {
  test.use({ colorScheme: 'light' });

  test('a dark preference is in the server HTML, so the first paint is dark', async ({
    context,
    page,
    baseURL,
  }) => {
    await setThemeCookie(context, baseURL!, 'dark');
    // The context's request shares its cookies: this is the HTML before any script runs.
    const res = await context.request.get('/');
    expect(res.status()).toBe(200);
    expect(await res.text()).toMatch(/<html[^>]*\sdata-theme="dark"/);

    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await bodyBackground(page)).toBe(DARK_BACKGROUND);
  });

  test('without a preference the page follows the OS', async ({ context, page }) => {
    const res = await context.request.get('/');
    expect(await res.text()).not.toMatch(/<html[^>]*\sdata-theme=/);

    await page.goto('/');
    expect(await bodyBackground(page)).toBe(LIGHT_BACKGROUND);
  });

  test('a light preference overrides a dark OS on public pages', async ({
    context,
    page,
    baseURL,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setThemeCookie(context, baseURL!, 'light');
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bodyBackground(page)).toBe(LIGHT_BACKGROUND);
  });
});

test.describe('on a dark OS', () => {
  test.use({ colorScheme: 'dark' });

  test('choosing Light in settings switches without a reload and survives one', async ({
    page,
  }) => {
    await openSettings(page);
    expect(await bodyBackground(page)).toBe(DARK_BACKGROUND);
    // A reload would drop this marker.
    await page.evaluate(() => {
      (window as unknown as { themeMarker: boolean }).themeMarker = true;
    });

    await choose(page, T.group, T.light);

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BACKGROUND);
    expect(
      await page.evaluate(() => (window as unknown as { themeMarker?: boolean }).themeMarker),
    ).toBe(true);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bodyBackground(page)).toBe(LIGHT_BACKGROUND);
    await expect(themeSelect(page)).toHaveText(T.light);

    // Back to System removes the override and the OS (dark) applies again.
    await choose(page, T.group, T.system);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect.poll(() => bodyBackground(page)).toBe(DARK_BACKGROUND);
  });
});

test.describe('after another tab changed the theme', () => {
  test.use({ colorScheme: 'light' });

  test('a refresh shows the theme from the cookie in the switch', async ({
    context,
    page,
    baseURL,
  }) => {
    await openSettings(page);
    await expect(themeSelect(page)).toHaveText(T.system);

    // Another tab picks Dark; this tab only learns it from the server on the next refresh,
    // which the language switch triggers.
    await setThemeCookie(context, baseURL!, 'dark');
    await choose(page, 'Мова', 'English');

    await expect(themeSelect(page, 'Theme')).toHaveText('Dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('settings on a phone', () => {
  for (const width of [320, 360]) {
    test(`fit ${width}px: full-width selects, every option visible`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await openSettings(page);
      const overflow = () =>
        page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      for (const [select, options] of [
        [T.group, [T.system, T.light, T.dark]],
        ['Мова', ['Українська', 'English']],
      ] as const) {
        const trigger = page.getByRole('combobox', { name: select, exact: true });
        const box = (await trigger.boundingBox())!;
        // The row stacks and the select fills it, inside the 16px gutters.
        expect(box.x).toBeGreaterThanOrEqual(16);
        expect(box.x + box.width).toBeLessThanOrEqual(width - 16 + 0.5);
        expect(box.width).toBeGreaterThan(width - 2 * 16 - 2 * 24);
        await trigger.click();
        for (const name of options) {
          const option = page.getByRole('option', { name, exact: true });
          await expect(option).toBeVisible();
          const optionBox = (await option.boundingBox())!;
          expect(optionBox.x + optionBox.width).toBeLessThanOrEqual(width);
        }
        expect(await overflow()).toBeLessThanOrEqual(0);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('listbox')).toHaveCount(0);
      }
      expect(await overflow()).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('public header', () => {
  for (const locale of ['de-DE', 'en-US']) {
    test.describe(locale, () => {
      test.use({ locale });
      for (const width of [320, 360, 393, 412, 640]) {
        test(`fits ${width}px with the wordmark`, async ({ page }) => {
          await page.setViewportSize({ width, height: 780 });
          for (const path of ['/', '/login']) {
            await page.goto(path);
            const brand = page.getByRole('banner').getByRole('link', { name: 'Stepler' });
            await expect(brand.getByText('Stepler')).toBeVisible();
            expect((await brand.boundingBox())!.width).toBeGreaterThanOrEqual(44);
            // Everything in the header stays inside the viewport.
            const rightmost = await page
              .getByRole('banner')
              .evaluate((header) =>
                Math.max(
                  ...Array.from(
                    header.querySelectorAll('*'),
                    (el) => el.getBoundingClientRect().right,
                  ),
                ),
              );
            expect(rightmost).toBeLessThanOrEqual(width);
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
            ).toBeLessThanOrEqual(0);
            // One row: the brand only.
            const header = await page.getByRole('banner').boundingBox();
            expect(header!.height).toBeLessThan(80);
          }
        });
      }
    });
  }
});

test.describe('sign-in card at 360px', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('the form keeps the same inset on both sides, Turnstile included', async ({ page }) => {
    await page.goto('/login');
    const submit = page.locator('form button[type="submit"]');
    // The widget is in once the always-pass test key has produced a token.
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    const { contentRight, buttonRight } = await submit.evaluate((button) => {
      const content = button.closest<HTMLElement>('[data-slot="card-content"]')!;
      const style = getComputedStyle(content);
      return {
        contentRight: content.getBoundingClientRect().right - parseFloat(style.paddingRight),
        buttonRight: button.getBoundingClientRect().right,
      };
    });
    expect(buttonRight).toBeLessThanOrEqual(contentRight + 0.5);
  });
});
