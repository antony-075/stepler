import { expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';
import { mainLinkPath, openGuestLink } from '../support/guest.js';
import { uploadViaApi } from '../support/media.js';

// The admin's side of uploads (PR C): file frames in «Вміст», the viewer, download, delete.
// Admin management journeys run on desktop Chrome only (@desktop).
test.use({ locale: 'de-DE' });

/** An admin with a collection holding a photo (#001), a document (#002) and a video (#003). */
async function withFiles(page: Page, browser: Parameters<typeof openGuestLink>[0]) {
  await signIn(page, newEmail());
  const { id } = await createCollectionViaApi(page, 'Ювілей');
  const guest = await openGuestLink(browser, await mainLinkPath(page, id));
  await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
  await uploadViaApi(guest, id, 'photo.jpg');
  await uploadViaApi(guest, id, 'doc.pdf');
  await uploadViaApi(guest, id, 'clip.mp4');
  await guest.context().close();
  await page.goto(`/app/collections/${id}`);
  await expect(page.getByRole('list', { name: 'Кадри колекції' })).toBeVisible();
  return id;
}

test.describe('collection files', () => {
  test('frames, viewer, download as attachment, delete @desktop', async ({ page, browser }) => {
    const id = await withFiles(page, browser);
    const grid = page.getByRole('list', { name: 'Кадри колекції' });
    await expect(grid.getByRole('button')).toHaveCount(3);
    // No original in the grid: photos and videos show the worker's thumbnails (or wait for
    // them); the document is a tile.
    await expect(grid.locator('img[src*="/uploads/"]')).toHaveCount(0);
    await expect(grid.getByText('doc.pdf')).toBeVisible();

    // The photo: its original in the viewer, with the details.
    await grid.getByRole('button', { name: /^Кадр 1,/ }).click();
    const viewer = page.getByRole('dialog', { name: /#001/ });
    await expect(viewer.getByRole('img', { name: 'Кадр 1' })).toBeVisible();
    await expect(viewer.getByText('photo.jpg')).toBeVisible();

    // The video plays natively.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('dialog', { name: /#002/ })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    const video = page.getByRole('dialog', { name: /#003/ });
    await expect(video.locator('video[preload="metadata"]')).toHaveCount(1);

    // The document: a tile and «Завантажити», an attachment with its own name.
    await page.keyboard.press('ArrowRight');
    const doc = page.getByRole('dialog', { name: /#002/ });
    const download = doc.getByRole('link', { name: 'Завантажити' }).first();
    const href = await download.getAttribute('href');
    expect(href).toContain('X-Amz-Signature');
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toMatch(
      /^attachment; filename="stepler-002\.pdf"/,
    );
    expect(res.headers()['content-type']).toBe('application/pdf');

    // Delete it.
    await doc.getByRole('button', { name: 'Видалити' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click();
    await expect(page.getByRole('dialog', { name: /#002/ })).toBeHidden();
    await expect(grid.getByRole('button')).toHaveCount(2);
    const counts = await page.request.get(`/api/v1/collections/${id}/content/counts`);
    expect(await counts.json()).toMatchObject({ total: 2, document: 0 });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('phone: the viewer is full screen and shows the photo @desktop', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await withFiles(page, browser);
    await page.getByRole('button', { name: /^Кадр 1,/ }).click();
    await expect(
      page.getByRole('dialog', { name: /#001/ }).getByRole('img', { name: 'Кадр 1' }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
