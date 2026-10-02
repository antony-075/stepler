import { expect, type Page } from '@playwright/test';

/** Same-origin API calls through the web proxy; unsafe methods need the app's `Origin`. */
function originHeader(page: Page): { origin: string } {
  return { origin: new URL(page.url()).origin };
}

/** Creates a collection as the signed-in admin of `page` (call after `signIn`). */
export async function createCollectionViaApi(
  page: Page,
  title: string,
  description?: string,
): Promise<{ id: string }> {
  const res = await page.request.post('/api/v1/collections', {
    data: { title, ...(description === undefined ? {} : { description }) },
    headers: originHeader(page),
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { id: string };
  return { id: body.id };
}

export async function archiveCollectionViaApi(page: Page, id: string): Promise<void> {
  const res = await page.request.post(`/api/v1/collections/${id}/archive`, {
    headers: originHeader(page),
  });
  expect(res.status()).toBe(200);
}

/** `document` is wider than the viewport, i.e. the page scrolls sideways (Review Focus 4). */
export const horizontalOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
