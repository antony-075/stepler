import { type Browser, expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';
import { guestLinks, mainLinkPath, openGuestLink } from '../support/guest.js';
import { bigBuffer, pickedFile } from '../support/media.js';

// Guest upload journeys (PR C, Review Focus 2 and 5). They run on all three projects: phones
// first. Ukrainian UI. Storage is the local S3 emulator, reached straight from the browser.
test.use({ locale: 'de-DE' });

const origin = (page: Page) => ({ origin: new URL(page.url()).origin });

async function setUp(page: Page) {
  await signIn(page, newEmail());
  const { id } = await createCollectionViaApi(page, 'Весілля Олі та Тараса');
  return { id, path: await mainLinkPath(page, id) };
}

async function asGuest(browser: Browser, path: string): Promise<Page> {
  const guest = await openGuestLink(browser, path);
  await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
  return guest;
}

/** The pencil action; the first time the name prompt comes first («Пропустити» opens the picker). */
async function pickFiles(guest: Page, files: Parameters<Page['setInputFiles']>[1]) {
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

const ownFrames = (guest: Page) => guest.getByRole('list', { name: 'Ваші кадри' });
const uploading = (guest: Page) => guest.getByRole('list', { name: 'Кадри, що завантажуються' });

test.describe('guest uploads', () => {
  test('a photo, a document and a video upload; a .exe is refused before upload', async ({
    page,
    browser,
  }) => {
    const { path } = await setUp(page);
    const guest = await asGuest(browser, path);
    await pickFiles(guest, [
      pickedFile('photo.jpg'),
      pickedFile('doc.pdf'),
      pickedFile('clip.mp4'),
      { name: 'setup.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') },
    ]);

    await expect(guest.getByText('1 файл не підходить: формат .exe')).toBeVisible();
    await guest.getByText('Чому?').click();
    await expect(guest.getByText(/Можна додати: JPG, PNG/)).toBeVisible();

    await expect(guest.getByRole('heading', { name: 'Готово, ваші кадри' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(guest.getByText('3 з 3')).toBeVisible();
    await expect(guest.getByRole('img', { name: 'Ваші кадри: 3' })).toBeVisible();
    await expect(uploading(guest).getByRole('listitem')).toHaveCount(3);
    await expect(uploading(guest).getByRole('group', { name: /^Кадр \d+, додано$/ })).toHaveCount(
      3,
    );
    // The saved own list does not repeat this visit's frames.
    await expect(ownFrames(guest)).toHaveCount(0);
    expect(await horizontalOverflow(guest)).toBeLessThanOrEqual(0);

    // After a reload the frames are the saved ones: the document with its name, the photo and
    // video waiting for their previews (PR D).
    await guest.reload();
    await expect(ownFrames(guest).getByRole('listitem')).toHaveCount(3);
    await expect(ownFrames(guest).getByText('doc.pdf')).toBeVisible();
    await expect(ownFrames(guest).getByText('Готується прев’ю')).toHaveCount(2);
    await guest.context().close();
  });

  test('a failing storage connection is retried without the guest doing anything', async ({
    page,
    browser,
  }) => {
    const { path } = await setUp(page);
    const guest = await asGuest(browser, path);
    let aborted = 0;
    await guest.route(/\/stepler-test\/collections\//, async (route) => {
      if (route.request().method() === 'PUT' && aborted < 2) {
        aborted += 1;
        await route.abort('connectionreset');
        return;
      }
      await route.continue();
    });
    await pickFiles(guest, [pickedFile('photo.png')]);
    await expect(guest.getByRole('heading', { name: 'Готово, ваші кадри' })).toBeVisible({
      timeout: 30_000,
    });
    expect(aborted).toBe(2);
    await guest.context().close();
  });

  test('cancel a file while it uploads: it leaves the sheet, the rest continues', async ({
    page,
    browser,
  }) => {
    const { path } = await setUp(page);
    const guest = await asGuest(browser, path);
    // Hold the video's part PUT until it is cancelled. The video is recognised by its upload id,
    // taken from its initiation: a PUT's Content-Length is not reported to routes on every
    // engine (Linux WebKit reports no body headers for an XHR Blob), so it cannot select it.
    let videoUploadId: string | null = null;
    await guest.route(/\/api\/v1\/guest\/collections\/[^/]+\/uploads$/, async (route) => {
      const response = await route.fetch();
      const request = route.request().postDataJSON() as { sizeBytes: number };
      if (request.sizeBytes > 1_000_000 && response.ok()) {
        videoUploadId = ((await response.json()) as { uploadId: string }).uploadId;
      }
      await route.fulfill({ response });
    });
    await guest.route(/\/stepler-test\/collections\//, async (route) => {
      const url = route.request().url();
      const held = videoUploadId !== null && url.includes(`/uploads/${videoUploadId}/`);
      if (route.request().method() === 'PUT' && held) return; // never answered
      await route.continue();
    });
    await pickFiles(guest, [
      pickedFile('photo.jpg'),
      { name: 'big.mp4', mimeType: 'video/mp4', buffer: bigBuffer(3_000_000, 'clip.mp4') },
    ]);
    const video = uploading(guest).getByRole('group', { name: /^Кадр 2 з 2, завантажується$/ });
    await expect(video).toBeVisible({ timeout: 15_000 });
    await uploading(guest).getByRole('button', { name: 'Скасувати: кадр 2 з 2' }).click();
    await expect(uploading(guest).getByRole('listitem')).toHaveCount(1);
    await expect(guest.getByRole('heading', { name: 'Готово, ваші кадри' })).toBeVisible({
      timeout: 30_000,
    });
    await guest.context().close();
  });

  test('the link is paused while a file uploads → the paused page; nothing is added', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await guest.route(/\/stepler-test\/collections\//, async (route) => {
      if (route.request().method() === 'PUT') await held;
      await route.continue();
    });
    await pickFiles(guest, [pickedFile('doc.pdf')]);
    await expect(uploading(guest).getByRole('group', { name: /завантажується/ })).toBeVisible();

    const main = (await guestLinks(page, id)).find((link) => link.isDefault)!;
    const res = await page.request.post(`/api/v1/guest-links/${main.id}/deactivate`, {
      headers: origin(page),
    });
    expect(res.status()).toBe(200);
    release();

    await expect(guest.getByRole('heading', { name: 'Посилання призупинене' })).toBeVisible({
      timeout: 30_000,
    });
    const counts = await page.request.get(`/api/v1/collections/${id}/content/counts`);
    expect(((await counts.json()) as { total: number }).total).toBe(0);
    await guest.context().close();
  });
});
