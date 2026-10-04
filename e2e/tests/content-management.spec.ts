import { type Browser, expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';
import { guestLinks, mainLinkPath, openGuestLink, submitTextViaApi } from '../support/guest.js';
import { uploadViaApi } from '../support/media.js';

// PR E: the guest's shared gallery and own delete, the admin's multi-select and the
// «Гості можуть видаляти своє» switch. Guest journeys run on all three projects; admin-only
// management journeys are `@desktop`. Ukrainian UI.
test.use({ locale: 'de-DE' });

const SHARED = {
  canUploadPhotos: true,
  canUploadVideos: true,
  canUploadDocuments: true,
  canSubmitText: true,
  canViewGallery: true,
  canDeleteOwn: true,
};
const VIEW_ONLY = {
  canUploadPhotos: false,
  canUploadVideos: false,
  canUploadDocuments: false,
  canSubmitText: false,
  canViewGallery: true,
  canDeleteOwn: false,
};

const origin = (page: Page) => ({ origin: new URL(page.url()).origin });

/** An admin with one collection whose main link has `permissions`; the link's path. */
async function setUp(page: Page, permissions: object = SHARED) {
  await signIn(page, newEmail());
  const { id } = await createCollectionViaApi(page, 'Весілля Олі та Тараса');
  const main = (await guestLinks(page, id)).find((link) => link.isDefault)!;
  const res = await page.request.patch(`/api/v1/guest-links/${main.id}`, {
    data: { permissions },
    headers: origin(page),
  });
  expect(res.status()).toBe(200);
  return { id, linkId: main.id, path: await mainLinkPath(page, id) };
}

async function extraLink(page: Page, id: string, label: string, permissions: object) {
  const res = await page.request.post(`/api/v1/collections/${id}/guest-links`, {
    data: { label, permissions },
    headers: origin(page),
  });
  expect(res.status()).toBe(201);
  return new URL(((await res.json()) as { url: string }).url).pathname;
}

async function asGuest(browser: Browser, path: string): Promise<Page> {
  const guest = await openGuestLink(browser, path);
  await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
  return guest;
}

const ownList = (guest: Page) => guest.getByRole('list', { name: 'Ваші кадри' });
const allList = (guest: Page) => guest.getByRole('list', { name: 'Усі кадри колекції' });

async function adminTotal(page: Page, id: string): Promise<number> {
  const res = await page.request.get(`/api/v1/collections/${id}/content/counts`);
  return ((await res.json()) as { total: number }).total;
}

test.describe('guest gallery and own delete', () => {
  test('A adds 2 photos; B sees both without numbers or delete; A deletes one; B refreshes', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const a = await asGuest(browser, path);
    await uploadViaApi(a, id, 'photo.jpg');
    await uploadViaApi(a, id, 'photo.png');
    const b = await asGuest(browser, path);

    // B: everyone's frames, no numbers, names or delete; the viewer says only time and kind.
    const others = allList(b).getByRole('button');
    await expect(others).toHaveCount(2);
    await expect(allList(b)).not.toContainText('#00');
    await others.first().click();
    const viewer = b.getByRole('dialog');
    await expect(viewer).toBeVisible();
    await expect(viewer).not.toContainText('#00');
    await expect(viewer).not.toContainText('photo.');
    await expect(viewer.getByRole('button', { name: 'Видалити' })).toHaveCount(0);
    await expect(viewer.getByRole('link', { name: 'Завантажити' }).first()).toBeVisible();
    await b.keyboard.press('Escape');

    // A: own frames open with «Видалити»; a plain confirm with the number.
    await a.reload();
    await ownList(a)
      .getByRole('button', { name: /^Кадр 2,/ })
      .click();
    await a.getByRole('dialog').getByRole('button', { name: 'Видалити' }).click();
    const confirm = a.getByRole('alertdialog', { name: 'Видалити кадр #002?' });
    await expect(confirm).toContainText('Організатор теж більше його не побачить.');
    await confirm.getByRole('button', { name: 'Видалити' }).click();
    await expect(a.getByText('Кадр видалено', { exact: true })).toBeVisible();
    await expect(ownList(a).getByRole('button')).toHaveCount(1);
    expect(await adminTotal(page, id)).toBe(1);

    // B's gallery is not polled; «Оновити» brings the change.
    await expect(others).toHaveCount(2);
    await b.getByRole('button', { name: 'Оновити' }).click();
    await expect(others).toHaveCount(1);
    expect(await horizontalOverflow(b)).toBeLessThanOrEqual(0);
    await a.context().close();
    await b.context().close();
  });

  test('a view-only link shows the gallery, opens frames and cannot add anything', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const writer = await asGuest(browser, path);
    await submitTextViaApi(writer, id, 'Вітаємо!');
    await writer.context().close();
    const viewOnly = await extraLink(page, id, 'Проектор', VIEW_ONLY);

    const viewer = await asGuest(browser, viewOnly);
    await expect(allList(viewer).getByRole('button')).toHaveCount(1);
    await expect(viewer.getByRole('button', { name: /^Додати/ })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Написати побажання' })).toHaveCount(0);
    await expect(
      viewer.getByRole('heading', { name: 'Ваші кадри, додані з цього пристрою' }),
    ).toHaveCount(0);
    await allList(viewer).getByRole('button').click();
    const dialog = viewer.getByRole('dialog');
    await expect(dialog).toContainText('Вітаємо!');
    await expect(dialog.getByRole('button', { name: 'Видалити' })).toHaveCount(0);
    await viewer.context().close();
  });

  test('a link without delete-own: no delete control anywhere for its guests', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page, { ...SHARED, canDeleteOwn: false });
    const guest = await asGuest(browser, path);
    await submitTextViaApi(guest, id, 'Моє');
    await guest.reload();
    await ownList(guest).getByRole('button').click();
    await expect(guest.getByRole('dialog')).toContainText('Моє');
    await expect(guest.getByRole('button', { name: 'Видалити' })).toHaveCount(0);
    await guest.context().close();
  });
});

test.describe('admin multi-select', () => {
  test('select 3 with Shift+click, delete them, the tab count drops @desktop', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    for (const body of ['Перше', 'Друге', 'Третє', 'Четверте']) {
      await submitTextViaApi(guest, id, body);
    }
    await guest.context().close();
    await page.goto(`/app/collections/${id}`);
    await expect(page.getByRole('tab', { name: /^Вміст/ })).toHaveText('Вміст4');

    await page.getByRole('button', { name: 'Вибрати', exact: true }).click();
    const bar = page.getByRole('region', { name: 'Дії з вибраними кадрами' });
    await expect(bar).toContainText('Вибрано 0');
    // Newest first: #004, #003, #002; Shift+click selects the range.
    await page.getByRole('button', { name: /^Кадр 4,/ }).click();
    await page.getByRole('button', { name: /^Кадр 2,/ }).click({ modifiers: ['Shift'] });
    await expect(bar).toContainText('Вибрано 3');
    await expect(page.getByRole('button', { name: /^Кадр 3, .*вибрано$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await bar.getByRole('button', { name: 'Видалити' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Видалити 3 кадри?' });
    await confirm.getByRole('button', { name: 'Видалити' }).click();
    await expect(page.getByText('Видалено 3 кадри', { exact: true })).toBeVisible();
    await expect(bar).toHaveCount(0);
    await expect(
      page.getByRole('list', { name: 'Кадри колекції' }).getByRole('button'),
    ).toHaveCount(1);
    await expect(page.getByRole('tab', { name: /^Вміст/ })).toHaveText('Вміст1');
  });

  test('x on a focused frame selects it; Escape clears; «Вибрати все завантажене» @desktop', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    for (const body of ['Перше', 'Друге']) await submitTextViaApi(guest, id, body);
    await guest.context().close();
    await page.goto(`/app/collections/${id}`);
    await page.getByRole('button', { name: /^Кадр 1,/ }).focus();
    await page.keyboard.press('x');
    const bar = page.getByRole('region', { name: 'Дії з вибраними кадрами' });
    await expect(bar).toContainText('Вибрано 1');
    await page.getByRole('button', { name: 'Вибрати все завантажене' }).click();
    await expect(bar).toContainText('Вибрано 2');
    await page.keyboard.press('Escape');
    await expect(bar).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Кадр 1,/ })).not.toHaveAttribute(
      'aria-pressed',
    );
  });

  test('phones: a long-press selects a frame; the bar does not cover the last row', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    for (let i = 1; i <= 12; i += 1) await submitTextViaApi(guest, id, `Побажання ${i}`);
    await guest.context().close();
    await page.goto(`/app/collections/${id}`);
    const frame = page.locator('[data-frame="12"]');
    await expect(frame).toBeVisible();
    // A touch held for 500ms without moving (dispatched: Playwright has no long-press).
    await frame.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 50, clientY: 50 });
    await page.waitForTimeout(650);
    await frame.dispatchEvent('pointerup', { pointerType: 'touch' });
    const bar = page.getByRole('region', { name: 'Дії з вибраними кадрами' });
    await expect(bar).toContainText('Вибрано 1');
    await expect(page.getByRole('button', { name: /^Кадр 12, .*вибрано$/ })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = (await page.locator('[data-frame="1"]').boundingBox())!;
    const barBox = (await bar.boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(barBox.y + 1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('the delete-own switch [C15]', () => {
  test('off on the link sheet → the guest loses «Видалити»; on again → it is back @desktop', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    await submitTextViaApi(guest, id, 'Моє');

    await page.goto(`/app/collections/${id}?tab=links&link=main`);
    const sheet = page.getByRole('dialog');
    const toggle = sheet.getByRole('switch', { name: 'Гості можуть видаляти своє' });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await sheet.getByRole('button', { name: 'Зберегти' }).click();
    await expect(page.getByText('Права збережено', { exact: true })).toBeVisible();
    expect(
      (
        (await (await page.request.get(`/api/v1/collections/${id}/guest-links`)).json()) as {
          items: { isDefault: boolean; permissions: { canDeleteOwn: boolean } }[];
        }
      ).items.find((link) => link.isDefault)!.permissions.canDeleteOwn,
    ).toBe(false);

    await guest.reload();
    await ownList(guest).getByRole('button').click();
    await expect(guest.getByRole('dialog')).toContainText('Моє');
    await expect(guest.getByRole('button', { name: 'Видалити' })).toHaveCount(0);
    await guest.keyboard.press('Escape');

    // Nothing to add → the switch turns off and is disabled with the reason.
    for (const type of ['Фото', 'Відео', 'Документи', 'Побажання']) {
      await sheet.getByRole('checkbox', { name: type, exact: true }).click();
    }
    await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveAccessibleDescription('Спершу дозвольте гостям щось додавати.');
    await guest.context().close();
  });
});
