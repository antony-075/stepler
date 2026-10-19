import { expect, test } from '@playwright/test';

// Every page answers the site-wide security headers (apps/web/next.config.ts); the editor's
// preview may be framed by this origin only, and a server without SEARCH_INDEXING=on (staging,
// CI) marks its pages noindex.

test('@desktop every page answers the security headers and stays out of search', async ({
  page,
  request,
}) => {
  for (const path of ['/', '/login', '/pricing']) {
    const headers = (await request.get(path)).headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(headers['permissions-policy']).toContain('camera=()');
  }
  await page.goto('/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('@desktop the editor preview may be framed by this origin; guest links send no Referer', async ({
  request,
}) => {
  const preview = (await request.get('/preview/unknown')).headers();
  expect(preview['x-frame-options']).toBe('SAMEORIGIN');
  expect(preview['content-security-policy']).toContain("frame-ancestors 'self'");
  const guest = (await request.get('/g/unknown')).headers();
  expect(guest['referrer-policy']).toBe('no-referrer');
  expect(guest['x-frame-options']).toBe('DENY');
});
