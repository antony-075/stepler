import {
  type Browser,
  expect,
  type FrameLocator,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import {
  createCollectionViaApi,
  guestPageViaApi,
  horizontalOverflow,
  publishGuestPageViaApi,
  saveGuestPageDraftViaApi,
  setDraftCoverFromFrameViaApi,
  waitForContentProcessed,
  waitForImageReady,
} from '../support/collections.js';
import { guestLinks, mainLinkPath, openGuestLink } from '../support/guest.js';
import { uploadViaApi } from '../support/media.js';

// The guest page editor (plan Task 16, ADR 0017): the «Гостьова сторінка» tab, its live preview,
// the draft and «Зберегти». What only an admin on a computer does is `@desktop`; what guests see
// and the editor at phone width run on all three projects. Ukrainian UI.
test.use({ locale: 'de-DE' });

const PENCIL = '#B83E26';
const PLUM = '#5A4A8C';
const EMERALD = '#2C7350';

const origin = (page: Page) => ({ origin: new URL(page.url()).origin });
const toast = (page: Page) => page.locator('[data-slot="toast-title"]');
const coverIn = (scope: Locator | Page | FrameLocator) =>
  scope.locator('[data-slot="guest-cover"] img');
const status = (page: Page) => page.locator('[data-slot="save-status"]');
const preview = (page: Page) => page.frameLocator('[data-slot="preview-iframe"]');

/** The accent a template root (the guest page, or the preview) is drawn with. */
const accentOf = (root: Locator) =>
  root.evaluate((element) =>
    (element as HTMLElement).style.getPropertyValue('--tpl-accent').trim().toUpperCase(),
  );

/** An admin with one collection whose main link lets guests upload and delete their own. */
async function setUp(page: Page, title = 'Весілля Олі та Тараса') {
  await signIn(page, newEmail());
  const { id } = await createCollectionViaApi(page, title);
  const main = (await guestLinks(page, id)).find((link) => link.isDefault)!;
  const res = await page.request.patch(`/api/v1/guest-links/${main.id}`, {
    data: {
      permissions: {
        canUploadPhotos: true,
        canUploadVideos: true,
        canUploadDocuments: true,
        canSubmitText: true,
        canViewGallery: true,
        canDeleteOwn: true,
      },
    },
    headers: origin(page),
  });
  expect(res.status()).toBe(200);
  return { id, path: await mainLinkPath(page, id) };
}

async function asGuest(browser: Browser, path: string): Promise<Page> {
  const guest = await openGuestLink(browser, path);
  await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
  return guest;
}

/** Opens the editor and waits until the preview drew the page. */
async function openEditor(page: Page, id: string) {
  await page.goto(`/app/collections/${id}?tab=appearance`);
  await expect(page.getByRole('tab', { name: 'Гостьова сторінка' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(preview(page).locator('[data-template]')).toBeVisible({ timeout: 15_000 });
}

/** Opens a closed section of the desktop panel's accordion. */
async function openSection(page: Page, name: string) {
  const row = page
    .getByRole('region', { name: 'Налаштування гостьової сторінки' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
}

test.describe('guest page editor', () => {
  test('an accent change shows in the preview at once; guests see it only after «Зберегти»; «Скинути зміни» reverts @desktop', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    expect(await accentOf(guest.locator('[data-template]'))).toBe(PENCIL);

    await openEditor(page, id);
    await expect(status(page)).toContainText('Збережено — гості бачать цю версію');
    await openSection(page, 'Акцент');
    await page.getByRole('radio', { name: 'Акцент: слива' }).click();
    // The working copy reaches the preview by postMessage, not by a save.
    await expect
      .poll(() => accentOf(preview(page).locator('[data-template]')), { timeout: 1000 })
      .toBe(PLUM);
    await expect(status(page)).toContainText('Чернетка — гості бачать попередню версію');
    // The autosave stores the draft; guests still see the published page.
    await expect
      .poll(async () => (await guestPageViaApi(page, id)).draft?.settings.accent)
      .toBe(PLUM);
    await guest.reload();
    expect(await accentOf(guest.locator('[data-template]'))).toBe(PENCIL);

    await page.getByRole('button', { name: /^Зберегти/ }).click();
    await expect(
      toast(page).filter({ hasText: 'Збережено — гості бачать нову сторінку' }),
    ).toBeVisible();
    await expect(status(page)).toContainText('Збережено — гості бачать цю версію');
    await guest.reload();
    expect(await accentOf(guest.locator('[data-template]'))).toBe(PLUM);

    // Another change, then «Скинути зміни»: back to what guests see.
    await page.getByRole('radio', { name: 'Акцент: смарагд' }).click();
    await expect.poll(() => accentOf(preview(page).locator('[data-template]'))).toBe(EMERALD);
    await page.getByRole('button', { name: 'Скинути зміни' }).click();
    await page
      .getByRole('alertdialog', { name: 'Скинути всі зміни?' })
      .getByRole('button', { name: 'Скинути' })
      .click();
    await expect.poll(() => accentOf(preview(page).locator('[data-template]'))).toBe(PLUM);
    await expect(status(page)).toContainText('Збережено — гості бачать цю версію');
    await guest.reload();
    expect(await accentOf(guest.locator('[data-template]'))).toBe(PLUM);
    await guest.context().close();
  });

  test('«Зробити обкладинкою» in the viewer puts the cover into the draft; guests get it on «Зберегти» @desktop', async ({
    page,
    browser,
  }) => {
    // The worker prepares the cover, then the editor asks again within 10 s: allow for both.
    test.setTimeout(60_000);
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    await uploadViaApi(guest, id, 'photo.jpg');
    await waitForContentProcessed(page, id, 1);

    await page.goto(`/app/collections/${id}?tab=content&frame=1`);
    await page.getByRole('button', { name: 'Зробити обкладинкою' }).click();
    await expect(toast(page).filter({ hasText: 'Обкладинку додано в чернетку' })).toBeVisible();
    // The viewer is a modal dialog, so the toast outside it is not in the accessibility tree.
    const action = page.locator('[data-slot="toast-action"]');
    await expect(action).toHaveText('Відкрити гостьову сторінку');
    await action.click();
    await expect(page).toHaveURL(/tab=appearance/);
    await expect(status(page)).toContainText('Чернетка — гості бачать попередню версію');
    await waitForImageReady(page, id, 'draft');
    // The editor asks again while the image is prepared; then the preview draws it.
    await expect(coverIn(preview(page))).toBeVisible({
      timeout: 30_000,
    });
    // Guests: still no hero (Review Focus 1).
    await guest.reload();
    await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(coverIn(guest)).toHaveCount(0);

    await page.getByRole('button', { name: /^Зберегти/ }).click();
    await expect(status(page)).toContainText('Збережено — гості бачать цю версію');
    await guest.reload();
    await expect(coverIn(guest)).toBeVisible();
    await guest.context().close();
  });

  test('two tabs: the one that saves second is told and can load the latest version @desktop', async ({
    page,
  }) => {
    const { id } = await setUp(page);
    const other = await page.context().newPage();
    await openEditor(page, id);
    await openEditor(other, id);
    await openSection(page, 'Акцент');
    await openSection(other, 'Акцент');

    await page.getByRole('radio', { name: 'Акцент: слива' }).click();
    await expect
      .poll(async () => (await guestPageViaApi(page, id)).draft?.settings.accent)
      .toBe(PLUM);

    // The other tab never saw that draft: its save is refused, never applied (Review Focus 2).
    await other.getByRole('radio', { name: 'Акцент: смарагд' }).click();
    await expect(other.getByText('Сторінку змінили в іншій вкладці')).toBeVisible({
      timeout: 10_000,
    });
    await other.getByRole('button', { name: 'Показати останню версію' }).click();
    await expect.poll(() => accentOf(preview(other).locator('[data-template]'))).toBe(PLUM);
    await expect(status(other)).toContainText('Чернетка — гості бачать попередню версію');
    await other.close();
  });

  test('guests see the published cover above the title and the welcome; nothing scrolls sideways', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const welcome = `Дякуємо, що ви з нами! ${'Додавайте фото з вечора, '.repeat(6)}`
      .slice(0, 160)
      .trim();
    await saveGuestPageDraftViaApi(page, id, { welcomeMessage: welcome });
    await publishGuestPageViaApi(page, id);
    const guest = await asGuest(browser, path);
    await expect(coverIn(guest)).toHaveCount(0);
    await expect(guest.locator('[data-slot="guest-welcome"]')).toHaveText(welcome);

    const frame = await uploadViaApi(guest, id, 'photo.jpg');
    await setDraftCoverFromFrameViaApi(page, id, frame.id);
    await publishGuestPageViaApi(page, id);
    await waitForImageReady(page, id, 'published');
    await guest.reload();
    const hero = coverIn(guest);
    await expect(hero).toBeVisible();
    const heroBox = (await hero.boundingBox())!;
    const titleBox = (await guest.getByRole('heading', { level: 1 }).boundingBox())!;
    expect(heroBox.y + heroBox.height).toBeLessThanOrEqual(titleBox.y);
    expect(await horizontalOverflow(guest)).toBeLessThanOrEqual(0);

    // The guest deletes the frame the cover came from: the cover stays (a copy).
    await guest
      .getByRole('list', { name: 'Ваші кадри' })
      .getByRole('button', { name: /^Кадр 1,/ })
      .click();
    await guest.getByRole('dialog').getByRole('button', { name: 'Видалити' }).click();
    await guest
      .getByRole('alertdialog', { name: 'Видалити кадр #001?' })
      .getByRole('button', { name: 'Видалити' })
      .click();
    await expect(guest.getByText('Кадр видалено', { exact: true })).toBeVisible();
    await guest.reload();
    await expect(coverIn(guest)).toBeVisible();
    await guest.context().close();
  });

  test('at phone width: «Налаштувати» opens the sheet, nothing scrolls sideways, 44px targets, «Зберегти» publishes', async ({
    page,
    browser,
  }, testInfo) => {
    if (testInfo.project.name === 'desktop-chrome')
      await page.setViewportSize({ width: 390, height: 844 });
    const { id, path } = await setUp(page);
    await page.goto(`/app/collections/${id}?tab=appearance`);
    const editor = page.locator('[data-slot="phone-editor"]');
    await expect(editor).toBeVisible();
    await expect(editor.locator('[data-slot="preview-chip"]')).toHaveText('Збережено');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    const open = page.getByRole('button', { name: 'Налаштувати' });
    expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await open.click();
    const sheet = page.getByRole('dialog', { name: 'Гостьова сторінка' });
    await expect(sheet).toBeVisible();
    // «Шаблон» is open first; one section at a time.
    await expect(sheet.getByRole('button', { name: /^Шаблон/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await sheet.getByRole('button', { name: /^Акцент/ }).click();
    await expect(sheet.getByRole('button', { name: /^Шаблон/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    for (const button of await sheet.getByRole('button').all()) {
      if (!(await button.isVisible())) continue;
      const box = (await button.boundingBox())!;
      expect(box.height, await button.innerText()).toBeGreaterThanOrEqual(44);
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await sheet.getByRole('radio', { name: 'Акцент: слива' }).click();
    await expect(status(page)).toContainText('Чернетка — гості бачать попередню версію');
    await sheet.getByRole('button', { name: /^Зберегти/ }).click();
    await expect(status(page)).toContainText('Збережено — гості бачать цю версію');
    const guest = await asGuest(browser, path);
    expect(await accentOf(guest.locator('[data-template]'))).toBe(PLUM);
    await guest.context().close();
  });

  test('the preview shows sample frames, never the collection’s own, in the chosen page state @desktop', async ({
    page,
    browser,
  }) => {
    const { id, path } = await setUp(page);
    const guest = await asGuest(browser, path);
    await uploadViaApi(guest, id, 'photo.jpg');
    await waitForContentProcessed(page, id, 1);
    await guest.context().close();

    await openEditor(page, id);
    const frame = preview(page);
    // Mine + others' by default: generated pictures, no presigned link to a guest's photo.
    await expect(frame.locator('[data-slot="guest-all-frames"] img').first()).toBeVisible();
    const sources = await frame
      .locator('[data-slot="guest-all-frames"] img')
      .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src));
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) expect(src.startsWith('data:image/svg+xml')).toBe(true);
    await expect(frame.locator('[data-slot="guest-own-frames"]')).toBeVisible();

    // Two controls (owner remark 92): the link's access, then the content.
    const access = page.getByRole('combobox', { name: /^Доступ за посиланням/ });
    const content = page.getByRole('combobox', { name: /^Вміст/ });
    await expect(access).toContainText('Бачать усе');
    await expect(content).toContainText('Мої й чужі');

    // Only their own: never «Усі кадри» (remark 91); others' content is refused with a reason.
    await access.click();
    await page.getByRole('option', { name: 'Лише своє' }).click();
    await expect(frame.locator('[data-slot="guest-own-frames"]')).toBeVisible();
    await expect(frame.locator('[data-slot="guest-all-frames"]')).toHaveCount(0);
    await expect(content).toContainText('Лише мої');
    await content.click();
    const others = page.getByRole('option', { name: /^Лише чужі/ });
    await expect(others).toHaveAttribute('aria-disabled', 'true');
    await expect(others).toContainText('Посилання не показує чужі кадри');
    await page.keyboard.press('Escape');

    await access.click();
    await page.getByRole('option', { name: 'Лише перегляд' }).click();
    await expect(frame.locator('[data-slot="guest-own-frames"]')).toHaveCount(0);
    await expect(frame.getByRole('button', { name: 'Додати фото й відео' })).toHaveCount(0);

    await access.click();
    await page.getByRole('option', { name: 'Призупинено' }).click();
    await expect(frame.getByRole('heading', { name: 'Посилання призупинене' })).toBeVisible();
    await expect(content).toBeDisabled();

    // The tablet frame: a 820px wide page inside.
    await page.getByRole('radio', { name: 'Планшет' }).click();
    await expect(page.locator('[data-slot="preview-device"]')).toHaveAttribute(
      'data-device',
      'tablet',
    );
    await expect(page.locator('[data-slot="preview-iframe"]')).toHaveCSS('width', '820px');
  });

  test('on a computer the editor is one workspace: the page does not scroll, the splitter resizes and is remembered @desktop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { id } = await setUp(page);
    await openEditor(page, id);
    // Only the settings panel scrolls (owner remark 66).
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
    ).toBeLessThanOrEqual(0);
    const panel = page.locator('[data-slot="settings-panel"]');
    for (const name of ['Привітання', 'Фон', 'Акцент', 'Шрифт', 'Розташування'])
      await openSection(page, name);
    expect(await panel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    // The cover lives in «Розташування» with its placement (remark 89), once.
    await expect(panel.locator('[data-slot="image-control"][data-image="cover"]')).toHaveCount(1);
    // The save bar is the settings panel's sticky top bar (remark 105): in view at any scroll.
    await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(panel.locator('[data-slot="save-bar"]')).toBeInViewport();
    await expect(page.getByRole('button', { name: /^Зберегти/ })).toBeInViewport();
    // The preview's toolbar is one row (remark 104).
    expect(
      (await page.locator('[data-slot="preview-toolbar"]').boundingBox())!.height,
    ).toBeLessThan(80);

    // The splitter, from the keyboard (remark 67).
    const before = (await panel.boundingBox())!.width;
    const handle = page.getByRole('separator', { name: 'Ширина панелі налаштувань' });
    await handle.focus();
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(before + 20);
    const wider = (await panel.boundingBox())!.width;
    await page.waitForTimeout(500);
    await page.reload();
    await expect(preview(page).locator('[data-template]')).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => Math.round((await panel.boundingBox())!.width))
      .toBeGreaterThan(Math.round(before) + 20);
    expect(Math.abs((await panel.boundingBox())!.width - wider)).toBeLessThan(4);
  });

  test('changed and changed back is saved; undo and redo across a template switch @desktop', async ({
    page,
  }) => {
    const { id } = await setUp(page);
    await openEditor(page, id);
    const frame = preview(page);
    const save = page.getByRole('button', { name: /^Зберегти/ });

    // By value (owner remark 113): back to what guests see reads «Збережено», nothing to save.
    await openSection(page, 'Акцент');
    await page.getByRole('radio', { name: 'Акцент: слива' }).click();
    await expect(status(page)).toContainText('Чернетка');
    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('radio', { name: 'Акцент: олівець' }).click();
    await expect(status(page)).toContainText('Збережено');
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: 'Скинути зміни' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    // Undo / redo, buttons and shortcuts, across a template switch.
    await page.locator('[data-template-option="journal"]').click();
    await expect(frame.locator('[data-template]')).toHaveAttribute('data-template', 'journal');
    const undo = page.getByRole('button', { name: 'Скасувати дію' });
    const redo = page.getByRole('button', { name: 'Повторити дію' });
    await undo.click();
    await expect(frame.locator('[data-template]')).toHaveAttribute('data-template', 'classic');
    await redo.click();
    await expect(frame.locator('[data-template]')).toHaveAttribute('data-template', 'journal');
    await expect(redo).toHaveAttribute('aria-disabled', 'true');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+z');
    await expect(frame.locator('[data-template]')).toHaveAttribute('data-template', 'classic');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(frame.locator('[data-template]')).toHaveAttribute('data-template', 'journal');
  });

  test('the four tab labels are never cut at 768, 1024 and 1440 @desktop', async ({ page }) => {
    const { id } = await setUp(page);
    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/app/collections/${id}?tab=appearance`);
      const tabs = page.getByRole('tablist', { name: 'Розділи колекції' });
      await expect(tabs.getByRole('tab', { name: 'Гостьова сторінка' })).toBeVisible();
      const cut = await tabs
        .locator('[role="tab"] > span:not([data-slot])')
        .evaluateAll((labels) =>
          labels.filter((label) => label.scrollWidth > label.clientWidth).map((l) => l.textContent),
        );
      expect(cut, `cut labels at ${width}px`).toEqual([]);
    }
  });
});
