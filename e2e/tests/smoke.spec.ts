import { expect, test } from '@playwright/test';

const UK_TAGLINE = 'Збирайте фото, відео та історії з події в одному місці';
const EN_TAGLINE = 'Collect photos, videos and stories from your event in one place';

// test.use keeps each project's device (viewport, touch, user agent); only the browser locale
// (which drives Accept-Language) changes.
test.describe('without a supported language preference', () => {
  test.use({ locale: 'de-DE' });

  test('home renders Ukrainian', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
    await expect(page.getByText(UK_TAGLINE)).toBeVisible();
  });
});

test.describe('with an English browser', () => {
  test.use({ locale: 'en-US' });

  test('home renders English', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText(EN_TAGLINE)).toBeVisible();
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
