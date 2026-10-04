import { randomUUID } from 'node:crypto';
import { type Browser, expect, type Page } from '@playwright/test';

type Link = { id: string; isDefault: boolean; url: string | null };

/** The signed-in admin's links of a collection (`page` is the admin's). */
export async function guestLinks(page: Page, collectionId: string): Promise<Link[]> {
  const res = await page.request.get(`/api/v1/collections/${collectionId}/guest-links`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { items: Link[] }).items;
}

/** The path of a collection's main guest link (`/g/{token}`). */
export async function mainLinkPath(page: Page, collectionId: string): Promise<string> {
  const main = (await guestLinks(page, collectionId)).find((link) => link.isDefault);
  return new URL(main!.url!).pathname;
}

/**
 * Opens a guest link in a fresh browser context, as another person's phone would: no admin
 * session, its own guest cookie. The page starts at the link; the caller closes the context.
 */
export async function openGuestLink(browser: Browser, path: string): Promise<Page> {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

/** Sends a wish through the API as the guest of `page` (after the page has its session). */
export async function submitTextViaApi(
  page: Page,
  collectionId: string,
  body: string,
): Promise<{ id: string; frameNo: number }> {
  const res = await page.request.post(`/api/v1/guest/collections/${collectionId}/texts`, {
    data: { body },
    headers: { origin: new URL(page.url()).origin, 'idempotency-key': randomUUID() },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; frameNo: number };
}

/** The pencil action; the first time the name prompt comes first («Пропустити» opens the picker). */
export async function pickFiles(guest: Page, files: Parameters<Page['setInputFiles']>[1]) {
  const chooser = guest.waitForEvent('filechooser');
  await guest
    .getByRole('button', { name: /^Додати (фото й відео|ще)$/ })
    .first()
    .click();
  // Before the first contribution the name prompt comes first; «Пропустити» opens the picker.
  const prompt = guest.getByRole('dialog', { name: 'Як вас звати?' });
  const first = await Promise.race([
    chooser.then(() => 'chooser' as const),
    prompt.waitFor({ state: 'visible' }).then(
      () => 'prompt' as const,
      () => 'chooser' as const,
    ),
  ]);
  if (first === 'prompt') await prompt.getByRole('button', { name: 'Пропустити' }).click();
  await (await chooser).setFiles(files);
}
