import { type BrowserContext, expect, type Page, test } from '@playwright/test';

// Ukrainian UI (no supported browser language → default locale). The three-item switch shows
// from `sm` (640px); phones get one cycling button, tested at the end.
test.use({ locale: 'de-DE', viewport: { width: 1024, height: 768 } });

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
      page
        .getByRole('radiogroup', { name: T.group, exact: true })
        .getByRole('radio', { name: T.system, exact: true }),
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

    const group = page.getByRole('radiogroup', { name: T.group, exact: true });
    await group.getByRole('radio', { name: T.light, exact: true }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BACKGROUND);
    expect(
      await page.evaluate(() => (window as unknown as { themeMarker?: boolean }).themeMarker),
    ).toBe(true);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bodyBackground(page)).toBe(LIGHT_BACKGROUND);
    await expect(group.getByRole('radio', { name: T.light, exact: true })).toBeChecked();

    // Back to System removes the override and the OS (dark) applies again.
    await group.getByRole('radio', { name: T.system, exact: true }).click();
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
    await page.goto('/login');
    const uk = page.getByRole('radiogroup', { name: T.group, exact: true });
    await expect(uk.getByRole('radio', { name: T.system, exact: true })).toBeChecked();

    // Another tab picks Dark; this tab only learns it from the server on the next refresh,
    // which the language switch triggers.
    await setThemeCookie(context, baseURL!, 'dark');
    await page
      .getByRole('radiogroup', { name: 'Мова', exact: true })
      .getByRole('radio', { name: 'EN', exact: true })
      .click();

    const en = page.getByRole('radiogroup', { name: 'Theme', exact: true });
    await expect(en.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('on a phone', () => {
  test.use({ colorScheme: 'dark', viewport: { width: 360, height: 780 } });

  test('one button cycles System → Light → Dark and says what it does', async ({
    page,
    browserName,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('radiogroup', { name: T.group, exact: true })).toBeHidden();
    const cycle = (current: string, next: string) =>
      page.getByRole('button', {
        name: `${T.group}: ${current}. Натисніть, щоб увімкнути: ${next}`,
        exact: true,
      });

    await cycle(T.system, T.light).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BACKGROUND);
    // Focus stays on the button, so it can be pressed again (WebKit does not focus on click).
    if (browserName !== 'webkit') await expect(cycle(T.light, T.dark)).toBeFocused();
    await cycle(T.light, T.dark).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await cycle(T.dark, T.system).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(cycle(T.system, T.light)).toBeVisible();
  });
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
            // The tools stay on the brand's row.
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
