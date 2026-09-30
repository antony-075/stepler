import { type BrowserContext, expect, type Page, test } from '@playwright/test';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const DARK_BACKGROUND = 'rgb(19, 20, 27)';
const LIGHT_BACKGROUND = 'rgb(244, 244, 247)';
const T = { group: 'Тема', light: 'Світла', dark: 'Темна', system: 'Системна' };

async function setThemeCookie(context: BrowserContext, baseURL: string, value: string) {
  await context.addCookies([{ name: 'st_theme', value, url: baseURL }]);
}

const bodyBackground = (page: Page) =>
  page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor);

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
    await expect(
      page.getByRole('radiogroup', { name: T.group }).getByRole('radio', { name: T.system }),
    ).toBeChecked();
  });
});

test.describe('on a dark OS', () => {
  test.use({ colorScheme: 'dark' });

  test('choosing Light switches without a reload and survives one', async ({ page }) => {
    await page.goto('/');
    expect(await bodyBackground(page)).toBe(DARK_BACKGROUND);
    // A reload would drop this marker.
    await page.evaluate(() => {
      (window as unknown as { themeMarker: boolean }).themeMarker = true;
    });

    const group = page.getByRole('radiogroup', { name: T.group });
    await group.getByRole('radio', { name: T.light }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BACKGROUND);
    expect(
      await page.evaluate(() => (window as unknown as { themeMarker?: boolean }).themeMarker),
    ).toBe(true);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bodyBackground(page)).toBe(LIGHT_BACKGROUND);
    await expect(group.getByRole('radio', { name: T.light })).toBeChecked();

    // Back to System removes the override and the OS (dark) applies again.
    await group.getByRole('radio', { name: T.system }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect.poll(() => bodyBackground(page)).toBe(DARK_BACKGROUND);
  });
});
