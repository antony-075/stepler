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

/** `PATCH /collections/{id}` as the signed-in admin (e.g. the welcome message). */
export async function updateCollectionViaApi(
  page: Page,
  id: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await page.request.patch(`/api/v1/collections/${id}`, {
    data: body,
    headers: originHeader(page),
  });
  expect(res.status()).toBe(200);
}

/** Makes a guest's photo frame the collection cover (a server-side copy). */
export async function setCoverFromFrameViaApi(
  page: Page,
  id: string,
  contentItemId: string,
): Promise<void> {
  const res = await page.request.post(`/api/v1/collections/${id}/cover/from-frame`, {
    data: { contentItemId },
    headers: originHeader(page),
  });
  expect(res.status()).toBe(200);
}

/** Waits until the worker made the cover's thumbnail and preview (`cover.status === 'READY'`). */
export async function waitForCoverReady(page: Page, id: string, timeoutMs = 30_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/v1/collections/${id}`);
        return ((await res.json()) as { cover: { status: string } | null }).cover?.status ?? null;
      },
      { timeout: timeoutMs },
    )
    .toBe('READY');
}
