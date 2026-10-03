import { type Browser, expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi, horizontalOverflow } from '../support/collections.js';
import { guestLinks, mainLinkPath, openGuestLink } from '../support/guest.js';

// Guest journeys run on all three projects (phones first). Ukrainian UI.
test.use({ locale: 'de-DE' });

const CONTRIBUTE_ALL_SEE = {
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

/** An admin with one collection; the path of its main (contribution-only) link. */
async function setUp(page: Page, title = 'Весілля Олі та Тараса') {
  await signIn(page, newEmail());
  const { id } = await createCollectionViaApi(page, title);
  return { id, path: await mainLinkPath(page, id) };
}

/** An additional link with these permissions; its path. */
async function extraLink(page: Page, id: string, label: string, permissions: object) {
  const res = await page.request.post(`/api/v1/collections/${id}/guest-links`, {
    data: { label, permissions },
    headers: origin(page),
  });
  expect(res.status()).toBe(201);
  return new URL(((await res.json()) as { url: string }).url).pathname;
}

/** The guest writes a wish; the first time the name prompt comes first. */
async function writeWish(guest: Page, body: string, name: string | null) {
  await guest.getByRole('button', { name: 'Написати побажання' }).click();
  const prompt = guest.getByRole('dialog', { name: 'Як вас звати?' });
  const composer = guest.getByRole('dialog', { name: 'Ваше побажання' });
  // Asked only before the first contribution of this session.
  await expect(prompt.or(composer)).toBeVisible();
  if (await prompt.isVisible()) {
    if (name === null) {
      await prompt.getByRole('button', { name: 'Пропустити' }).click();
    } else {
      await prompt.getByRole('textbox', { name: 'Ім’я' }).fill(name);
      await prompt.getByRole('button', { name: 'Продовжити' }).click();
    }
  }
  await composer.getByRole('textbox', { name: 'Побажання' }).fill(body);
  await composer.getByRole('button', { name: 'Надіслати' }).click();
  await expect(composer).toBeHidden();
}

const ownFrames = (guest: Page) => guest.getByRole('list', { name: 'Ваші кадри' });

async function asGuest(browser: Browser, path: string): Promise<Page> {
  const guest = await openGuestLink(browser, path);
  await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
  return guest;
}

test.describe('guest wishes', () => {
  test('skip the name, send a wish (#001); the admin sees «Без імені» and deletes it', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    await guest.getByRole('button', { name: 'Написати побажання' }).click();
    const prompt = guest.getByRole('dialog', { name: 'Як вас звати?' });
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Пропустити' }).click();
    const composer = guest.getByRole('dialog', { name: 'Ваше побажання' });
    await composer.getByRole('textbox', { name: 'Побажання' }).fill('Вітаємо!');
    await composer.getByRole('button', { name: 'Надіслати' }).click();
    await expect(guest.getByText('Побажання додано', { exact: true })).toBeVisible();
    await expect(ownFrames(guest).getByRole('group', { name: /^Кадр 1, побажання/ })).toBeVisible();
    await expect(ownFrames(guest)).toContainText('#001');
    // Asked once: the next wish goes straight to the composer.
    await guest.getByRole('button', { name: 'Написати побажання' }).click();
    await expect(guest.getByRole('dialog', { name: 'Ваше побажання' })).toBeVisible();
    await guest.keyboard.press('Escape');

    await page.goto(`/app/collections/${id}`);
    const frame = page.getByRole('button', { name: /^Кадр 1, побажання, .+, Без імені$/ });
    await frame.click();
    const viewer = page.getByRole('dialog', { name: /#001/ });
    await expect(viewer.getByText('Вітаємо!')).toBeVisible();
    await viewer.getByRole('button', { name: 'Видалити' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Видалити кадр #001?' });
    await confirm.getByRole('button', { name: 'Видалити' }).click();
    await expect(page.getByText('Кадр видалено', { exact: true })).toBeVisible();
    await expect(frame).toHaveCount(0);

    await guest.reload();
    await expect(guest.getByText('Тут з’являться кадри, які ви додасте.')).toBeVisible();
    await guest.context().close();
  });

  test('a name is shown to the admin, never to other guests (nor their numbers)', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const first = await asGuest(browser, path);
    await writeWish(first, 'Перше', null);
    const second = await asGuest(browser, path);
    await writeWish(second, 'Щастя вам!', 'Ірина');
    await expect(second.getByText('Ви: Ірина')).toBeVisible();

    await page.goto(`/app/collections/${id}`);
    await page.getByRole('button', { name: /^Кадр 2, побажання, .+, Ірина$/ }).click();
    await expect(page.getByRole('dialog', { name: /#002/ })).toContainText('Ірина');
    await page.keyboard.press('Escape');

    const sharedPath = await extraLink(page, id, 'Гості', CONTRIBUTE_ALL_SEE);
    const third = await asGuest(browser, sharedPath);
    const all = third.getByRole('list', { name: 'Усі кадри колекції' });
    await expect(all.getByText('Щастя вам!')).toBeVisible();
    const text = (await third.locator('main').textContent()) ?? '';
    expect(text).not.toContain('Ірина');
    expect(text).not.toContain('#002');
    expect(text).not.toContain('#001');
    for (const guest of [first, second, third]) await guest.context().close();
  });

  test('a view-only link has no dock; a contribution-only link sees only its own', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const writer = await asGuest(browser, path);
    await writeWish(writer, 'Від першого гостя', null);

    const viewOnly = await asGuest(browser, await extraLink(page, id, 'Перегляд', VIEW_ONLY));
    await expect(viewOnly.getByText('Від першого гостя')).toBeVisible();
    await expect(viewOnly.getByRole('button', { name: 'Написати побажання' })).toHaveCount(0);

    const other = await asGuest(browser, path);
    await expect(other.getByText('Ваші кадри побачить лише організатор')).toBeVisible();
    await expect(other.getByText('Від першого гостя')).toHaveCount(0);
    for (const guest of [writer, viewOnly, other]) await guest.context().close();
  });

  test('Review Focus 2: the link is paused while the page is open → the paused page, no frame', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    await writeWish(guest, 'Перше, поки працює', null);
    const main = (await guestLinks(page, id)).find((link) => link.isDefault)!;
    const res = await page.request.post(`/api/v1/guest-links/${main.id}/deactivate`, {
      headers: origin(page),
    });
    expect(res.status()).toBe(200);
    // The send meets the link's state: the whole page switches to it (the sheet goes too).
    await guest.getByRole('button', { name: 'Написати побажання' }).click();
    const composer = guest.getByRole('dialog', { name: 'Ваше побажання' });
    await composer.getByRole('textbox', { name: 'Побажання' }).fill('Не дійде');
    await composer.getByRole('button', { name: 'Надіслати' }).click();
    await expect(guest.getByRole('heading', { level: 1 })).toHaveText('Посилання призупинене');
    await expect(composer).toBeHidden();
    const counts = await page.request.get(`/api/v1/collections/${id}/content/counts`);
    expect(((await counts.json()) as { total: number }).total).toBe(1);
    await guest.context().close();
  });

  test('the session survives a reload: own frames stay', async ({ page, browser }) => {
    const { path } = await setUp(page);
    const guest = await asGuest(browser, path);
    await writeWish(guest, 'Залишуся', null);
    await guest.reload();
    await expect(ownFrames(guest).getByText('Залишуся')).toBeVisible();
    await expect(guest.getByText('Ви без імені')).toBeVisible();
    await guest.context().close();
  });

  test('Review Focus 5: a 100-character title and a 5000-character wish never scroll sideways', async ({
    page,
    browser,
  }) => {
    const title = `${'Велике'.repeat(16)}Свято`.slice(0, 100);
    const { path } = await setUp(page, title);
    const guest = await asGuest(browser, path);
    await writeWish(guest, 'Найкращі побажання! '.repeat(250).slice(0, 5000), null);
    for (const width of [360, 390]) {
      await guest.setViewportSize({ width, height: 780 });
      await expect(ownFrames(guest)).toBeVisible();
      expect(await horizontalOverflow(guest)).toBeLessThanOrEqual(0);
    }
    await guest.context().close();
  });
});
