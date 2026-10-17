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

/** The upload sheet (owner remark 2026-10-16: uploads run in their own sheet). */
export const uploadSheet = (guest: Page) => guest.getByRole('dialog', { name: 'Завантаження' });

/** One of the page's two tabs («Додати» / «Кадри»). */
const viewTab = (guest: Page, name: 'Додати' | 'Кадри') =>
  guest.getByRole('tab', { name: new RegExp(`^${name}`) });

/** Folds the upload sheet when it is open. */
async function foldSheet(guest: Page): Promise<void> {
  if (await uploadSheet(guest).isVisible()) {
    await uploadSheet(guest).getByRole('button', { name: 'Згорнути' }).click();
    await expect(uploadSheet(guest)).toBeHidden();
  }
}

/**
 * Switches to a view on phones and tablets. From 1024px both views show and the tabs are
 * hidden; a view-only link has none. Right after a load the page may not be drawn yet, so the
 * template root and then the tab are awaited.
 */
async function showView(guest: Page, name: 'Додати' | 'Кадри'): Promise<void> {
  await foldSheet(guest);
  if ((guest.viewportSize()?.width ?? 1280) >= 1024) return;
  await guest.locator('[data-template]').first().waitFor();
  const tab = viewTab(guest, name);
  // A view-only link has no tabs: a short wait for them, then nothing to switch.
  const present = await tab.waitFor({ state: 'visible', timeout: 3000 }).then(
    () => true,
    () => false,
  );
  if (!present) return;
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** The guest's frames: the sheet folded, then «Кадри» on phones and tablets. */
export const showFrames = (guest: Page) => showView(guest, 'Кадри');

/** The «Додати» view, where the actions are (the sheet folded first). */
export const showAdd = (guest: Page) => showView(guest, 'Додати');

/**
 * The pencil action, or «Додати ще» in the open upload sheet; the first time the name prompt
 * comes first («Пропустити» opens the picker). The sheet opens with the picked files.
 */
export async function pickFiles(guest: Page, files: Parameters<Page['setInputFiles']>[1]) {
  const chooser = guest.waitForEvent('filechooser');
  if (await uploadSheet(guest).isVisible()) {
    await uploadSheet(guest).getByRole('button', { name: 'Додати ще' }).click();
  } else {
    await showAdd(guest);
    await guest
      .getByRole('button', { name: /^Додати (фото й відео|фото|відео|документи)$/ })
      .first()
      .click();
  }
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
