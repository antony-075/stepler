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

type Version = {
  settings: Record<string, unknown>;
  templateId: string;
  welcomeMessage: string | null;
};
type Editor = {
  published: Version & { cover: { status: string } | null };
  draft: (Version & { revision: number; cover: { status: string } | null }) | null;
};

const guestPage = (id: string) => `/api/v1/collections/${id}/guest-page`;

export async function guestPageViaApi(page: Page, id: string): Promise<Editor> {
  const res = await page.request.get(guestPage(id));
  expect(res.status()).toBe(200);
  return (await res.json()) as Editor;
}

/**
 * Saves the draft as the editor would: the current version with `change` on top. A new
 * `templateId` starts from `settings` as given (pass the template's defaults).
 */
export async function saveGuestPageDraftViaApi(
  page: Page,
  id: string,
  change: {
    templateId?: string;
    settings?: Record<string, unknown>;
    welcomeMessage?: string | null;
  },
): Promise<Editor> {
  const editor = await guestPageViaApi(page, id);
  const current = editor.draft ?? editor.published;
  const switching = change.templateId !== undefined && change.templateId !== current.templateId;
  const res = await page.request.put(`${guestPage(id)}/draft`, {
    data: {
      baseRevision: editor.draft?.revision ?? null,
      templateId: change.templateId ?? current.templateId,
      settings: switching ? change.settings : { ...current.settings, ...change.settings },
      welcomeMessage:
        change.welcomeMessage === undefined ? current.welcomeMessage : change.welcomeMessage,
    },
    headers: originHeader(page),
  });
  expect(res.status()).toBe(200);
  return (await res.json()) as Editor;
}

/** «Зберегти»: publishes the current draft (there must be one). */
export async function publishGuestPageViaApi(page: Page, id: string): Promise<void> {
  const { draft } = await guestPageViaApi(page, id);
  expect(draft).not.toBeNull();
  const res = await page.request.post(`${guestPage(id)}/publish`, {
    data: { revision: draft?.revision },
    headers: originHeader(page),
  });
  expect(res.status()).toBe(200);
}

/** Puts a guest's photo frame into the draft as its cover (a server-side copy). */
export async function setDraftCoverFromFrameViaApi(
  page: Page,
  id: string,
  contentItemId: string,
): Promise<void> {
  const res = await page.request.post(`${guestPage(id)}/draft/cover/from-frame`, {
    data: { contentItemId },
    headers: originHeader(page),
  });
  expect(res.status()).toBe(200);
}

/** Waits until the worker made the cover of the draft (or the published version) `READY`. */
export async function waitForImageReady(
  page: Page,
  id: string,
  version: 'draft' | 'published' = 'draft',
  timeoutMs = 30_000,
): Promise<void> {
  await expect
    .poll(async () => (await guestPageViaApi(page, id))[version]?.cover?.status ?? null, {
      timeout: timeoutMs,
    })
    .toBe('READY');
}

/**
 * Waits until the collection holds `count` frames and the worker is done with each: every
 * `processingStatus` is `READY` or `NOT_REQUIRED` (as the signed-in admin of `page`). Call it
 * before a reload or navigation that should find the thumbnails already made; otherwise the page
 * legitimately waits for its next poll (15–20 s for a guest) and the test's budget runs out.
 */
export async function waitForContentProcessed(
  page: Page,
  id: string,
  count: number,
  timeoutMs = 30_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/v1/collections/${id}/content?limit=100`);
        const { items } = (await res.json()) as { items: { processingStatus: string }[] };
        const done = ['READY', 'NOT_REQUIRED'];
        return {
          frames: items.length,
          unfinished: items.filter((item) => !done.includes(item.processingStatus)).length,
        };
      },
      { timeout: timeoutMs },
    )
    .toEqual({ frames: count, unfinished: 0 });
}
