import { expect, test } from '@playwright/test';

const UK_TITLE = 'Зберіть усе з події в одну колекцію';
const EN_TITLE = 'Gather everything from your event in one collection';

// test.use keeps each project's device (viewport, touch, user agent); only the browser locale
// (which drives Accept-Language) changes.
test.describe('without a supported language preference', () => {
  test.use({ locale: 'de-DE' });

  test('home renders Ukrainian', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
    await expect(page.getByRole('heading', { level: 1, name: UK_TITLE })).toBeVisible();
  });
});

test.describe('with an English browser', () => {
  test.use({ locale: 'en-US' });

  test('home renders English', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: EN_TITLE })).toBeVisible();
  });
});

test('API is reachable same-origin through the web app', async ({ request }) => {
  const res = await request.get('/api/v1/health/live');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});

test('page fits the viewport without horizontal scroll', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
