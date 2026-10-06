import { expect, type Locator, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { createCollectionViaApi } from '../support/collections.js';

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

const T = {
  links: 'Посилання',
  main: 'Основне посилання',
  active: 'Активне',
  paused: 'Призупинене',
  link: 'Посилання',
  copy: 'Копіювати',
  copied: 'Скопійовано',
  downloadQr: 'Завантажити QR',
  png: 'PNG для друку',
  svg: 'SVG',
  save: 'Зберегти',
  rotate: 'Оновити посилання',
  works: 'Посилання працює',
  guestLink: 'Посилання для гостей',
  shareTitle: 'Поділитися з гостями',
  downloadPng: 'Завантажити для друку (PNG)',
};

const toast = (page: Page) => page.locator('[data-slot="toast-title"]');

/** On a phone a toast can sit over the sheet (its top, under the top bar): close every one first. */
async function closeToasts(page: Page): Promise<void> {
  await expect(async () => {
    const close = page.getByRole('button', { name: 'Закрити сповіщення' });
    if ((await close.count()) > 0) await close.first().click();
    await expect(page.locator('[data-slot="toast"]')).toHaveCount(0, { timeout: 500 });
  }).toPass();
}

async function openLinks(page: Page, title: string): Promise<{ id: string }> {
  await signIn(page, newEmail());
  const collection = await createCollectionViaApi(page, title);
  await page.goto(`/app/collections/${collection.id}`);
  await page.getByRole('tab', { name: /^Посилання/ }).click();
  await expect(page).toHaveURL(`/app/collections/${collection.id}?tab=links`);
  return collection;
}

/** A link's row on the «Посилання» tab. */
const row = (scope: Page | Locator, name: string): Locator => {
  // `has` is matched inside each row, so it must not carry the scope's own selector.
  const root = 'page' in scope && typeof scope.page === 'function' ? scope.page() : (scope as Page);
  return scope.locator('[data-slot="link-list-row"]').filter({
    has: root.getByRole('heading', { name, exact: true }),
  });
};

/** A link's settings sheet, named after the link. */
const sheetOf = (page: Page, name: string): Locator =>
  page.getByRole('dialog', { name, exact: true });

/** Presses a link row's one button, «Керувати» (named after the link). */
async function rowAct(rowLocator: Locator, name: string, item: 'Керувати'): Promise<void> {
  await rowLocator.getByRole('button', { name: `${item} «${name}»`, exact: true }).click();
}

/** The «Посилання» tab's panel (the list of every link). */
async function openAll(page: Page): Promise<Locator> {
  const panel = page.getByRole('tabpanel', { name: /^Посилання/ });
  await expect(panel).toBeVisible();
  return panel;
}

/** Opens a link's settings from its row on the tab. */
async function openLink(page: Page, name: string): Promise<Locator> {
  await rowAct(row(await openAll(page), name), name, 'Керувати');
  const sheet = sheetOf(page, name);
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('links tab', () => {
  test('the «Посилання» tab lists every link; a link’s settings open in a sheet', async ({
    page,
  }) => {
    const collection = await openLinks(page, 'Весілля Олі та Тараса');
    const tabUrl = page.url();
    // Two segments, the active one in the URL; where we are: «Колекції › title».
    const tabs = page.getByRole('tablist', { name: 'Розділи колекції' });
    await expect(tabs.getByRole('tab')).toHaveText([
      'Вміст0',
      'Посилання1',
      'Гостьова сторінка',
      'Параметри колекції',
    ]);
    await expect(tabs.getByRole('tab', { name: /^Посилання/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Laptop heights compact the tabs to 36px (owner remark 104; mouse pointer, above WCAG 2.5.8's
    // 24px); everywhere else they keep the 44px touch target.
    const laptop = await page.evaluate(
      () => matchMedia('(min-width: 64rem) and (max-height: 62.5rem)').matches,
    );
    for (const tab of await tabs.getByRole('tab').all()) {
      expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(laptop ? 36 : 44);
    }
    const crumbs = page.getByRole('navigation', { name: 'Де ви зараз' });
    await expect(crumbs.getByRole('listitem')).toHaveText(['Колекції', 'Весілля Олі та Тараса']);
    await expect(tabs.getByRole('tab', { name: 'Параметри колекції' })).toBeVisible();

    const panel = await openAll(page);
    const main = row(panel, T.main);
    await expect(main.getByText(T.active, { exact: true })).toBeVisible();
    await expect(main.getByRole('img', { name: `QR-код посилання “${T.main}”` })).toBeVisible();
    await expect(main.getByText(/\/g\/[A-Za-z0-9_-]{43}$/)).toBeVisible();
    // What guests may do, compact (owner 2026-10-03): the types, then whose content they see.
    await expect(
      main.getByText('Фото · Відео · Документи · Побажання · Бачать лише своє'),
    ).toBeVisible();
    // The QR (the one way to share), the copy icon by the address and one «Керувати»
    // (owner 2026-10-03: pausing lives in the link's sheet).
    await expect(main.getByRole('button')).toHaveCount(3);
    await expect(main.locator('[data-slot="link-actions"]').getByRole('button')).toHaveText([
      'Керувати',
    ]);
    const copyBox = await main.getByRole('button', { name: 'Копіювати посилання' }).boundingBox();
    // 44px on phones; V1's dense 36px with a mouse (above WCAG 2.5.8's 24px).
    expect(copyBox!.height).toBeGreaterThanOrEqual(page.viewportSize()!.width < 768 ? 40 : 32);
    // The row itself is not a link: a click on its text stays put.
    await expect(main.getByRole('link')).toHaveCount(0);
    await main.getByText(/^Фото · Відео/).click();
    await expect(page).toHaveURL(tabUrl);
    const extra = panel.getByRole('region', { name: 'Додаткові посилання' });
    await expect(extra.getByText('Додаткових посилань ще немає')).toBeVisible();
    await expect(extra.getByRole('button', { name: 'Нове посилання' })).toHaveCount(1);

    const sheet = await openLink(page, T.main);
    await expect(page).toHaveURL(`/app/collections/${collection.id}?tab=links&link=main`);
    await expect(sheet.getByText(T.active, { exact: true })).toBeVisible();
    const field = sheet.getByRole('textbox', { name: T.guestLink });
    await expect(field).toHaveValue(/\/g\/[A-Za-z0-9_-]{43}$/);
    const open = sheet.getByRole('link', { name: /^Відкрити/ });
    await expect(open).toHaveAttribute('href', await field.inputValue());
    await expect(open).toHaveAttribute('target', '_blank');
    for (const type of ['Фото', 'Відео', 'Документи', 'Побажання']) {
      await expect(sheet.getByRole('checkbox', { name: type, exact: true })).toBeChecked();
    }
    await expect(sheet.getByRole('radio', { name: /^Лише своє/ })).toBeChecked();
    await expect(sheet.getByRole('switch', { name: T.works })).toBeChecked();
    // The main link can only be replaced; the danger zone says so and offers no delete.
    await expect(sheet.getByRole('button', { name: T.rotate })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Видалити посилання' })).toHaveCount(0);
    await expect(
      sheet.getByText('Основне посилання не можна видалити — лише оновити.'),
    ).toBeVisible();

    // Back closes the sheet and keeps the tab.
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(tabUrl);
    // Back again returns to «Вміст»; a refresh keeps the tab in the URL.
    await page.goBack();
    await expect(page).toHaveURL(`/app/collections/${collection.id}`);
    await expect(tabs.getByRole('tab', { name: 'Вміст' })).toHaveAttribute('aria-selected', 'true');
    await page.goto(tabUrl);
    await expect(tabs.getByRole('tab', { name: /^Посилання/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // The old addresses land on the tab.
    await page.goto(`/app/collections/${collection.id}/links/main`);
    await expect(page).toHaveURL(`/app/collections/${collection.id}?tab=links&link=main`);
    await expect(sheetOf(page, T.main)).toBeVisible();
    await sheetOf(page, T.main).getByRole('button', { name: 'Закрити', exact: true }).click();
    await expect(page).toHaveURL(tabUrl);
    await page.goto(`/app/collections/${collection.id}/links`);
    await expect(page).toHaveURL(tabUrl);
  });

  test('the QR thumbnail opens that link’s share dialog, named after it', async ({ page }) => {
    await openLinks(page, 'Ювілей');
    await row(page, T.main)
      .getByRole('button', { name: `Показати QR-код і поділитися «${T.main}»` })
      .click();
    const dialog = page.getByRole('dialog', { name: T.shareTitle });
    await expect(dialog.locator('[data-slot="share-link-status"]')).toContainText(T.main);
    await expect(dialog.getByRole('img', { name: `QR-код посилання “${T.main}”` })).toBeVisible();
    await expect(dialog.getByRole('button', { name: T.downloadPng })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'SVG' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Копіювати посилання' })).toBeVisible();
    await expect(dialog.getByRole('link', { name: /^Відкрити як гість/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the share dialog picks between live links; QR and link follow the choice', async ({
    page,
  }) => {
    await openLinks(page, 'Ювілей');
    const all = await openAll(page);
    await all.getByRole('button', { name: 'Нове посилання' }).click();
    const create = page.getByRole('dialog', { name: 'Нове посилання' });
    await create.getByRole('textbox', { name: 'Назва' }).fill('Фотограф');
    await create.getByRole('button', { name: 'Створити' }).click();
    await expect(toast(page).filter({ hasText: 'Посилання створено' })).toBeVisible();
    await closeToasts(page);

    // Opened from the additional link's «⋯»: that link is preselected.
    await row(all, 'Фотограф')
      .getByRole('button', { name: 'Показати QR-код і поділитися «Фотограф»' })
      .click();
    const dialog = page.getByRole('dialog', { name: T.shareTitle });
    const picker = dialog.getByRole('combobox', { name: 'Посилання' });
    await expect(picker).toHaveText('Фотограф');
    const field = dialog.getByRole('textbox', { name: T.link });
    const extraUrl = await field.inputValue();
    await expect(dialog.getByRole('img', { name: 'QR-код посилання “Фотограф”' })).toBeVisible();

    // Switching to the main link changes the QR, the field and Open together.
    await picker.click();
    await page.getByRole('option', { name: T.main }).click();
    await expect(dialog.getByRole('img', { name: `QR-код посилання “${T.main}”` })).toBeVisible();
    await expect(field).not.toHaveValue(extraUrl);
    await expect(dialog.getByRole('link', { name: /^Відкрити як гість/ })).toHaveAttribute(
      'href',
      await field.inputValue(),
    );
    // The whole address is visible: the field is not shorter than its text.
    expect(await field.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  });

  test('the link copies from the list and the sheet, and the QR downloads as PNG and SVG', async ({
    page,
    context,
    browserName,
  }) => {
    await openLinks(page, 'Ювілей: бабусі/Галини');
    // WebKit has no clipboard permission to grant; there the fallback is covered by stories.
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      // A small copy icon right after the address.
      const mainRow = row(page.locator('main'), T.main);
      await mainRow.getByRole('button', { name: 'Копіювати посилання' }).click();
      await expect(mainRow.getByRole('button', { name: T.copied })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/g\//);
    }

    const sheet = await openLink(page, T.main);
    const url = await sheet.getByRole('textbox', { name: T.guestLink }).inputValue();
    if (browserName === 'chromium') {
      await sheet.getByRole('button', { name: T.copy, exact: true }).click();
      await expect(sheet.getByRole('button', { name: T.copied })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    }

    for (const [item, extension] of [
      [T.png, 'png'],
      [T.svg, 'svg'],
    ] as const) {
      await sheet.getByRole('button', { name: T.downloadQr }).click();
      const downloading = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: item }).click();
      const download = await downloading;
      // WebKit reports the name decomposed (NFD).
      expect(download.suggestedFilename().normalize('NFC')).toBe(
        `stepler-qr-Ювілей бабусі Галини.${extension}`,
      );
    }
  });

  test('permissions change only on Save; Cancel puts them back', async ({ page }) => {
    const collection = await openLinks(page, 'Хрестини');
    let sheet = await openLink(page, T.main);
    const documents = sheet.getByRole('checkbox', { name: 'Документи' });
    const save = sheet.getByRole('button', { name: T.save });
    // Nothing changed: no Save to press.
    await expect(save).toHaveCount(0);

    // The whole tile is the target, not only the box.
    await sheet.getByText('PDF, файли').click();
    await expect(documents).not.toBeChecked();
    // A warning bar with Save and Cancel, announced.
    await expect(sheet.getByRole('status').filter({ hasText: 'Є незбережені зміни' })).toHaveText(
      'Є незбережені зміни — гості їх ще не бачать.',
    );

    // Closing the sheet asks first; dismissing keeps it open with the change.
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('не збережено');
      void dialog.dismiss();
    });
    await page.keyboard.press('Escape');
    await expect(sheet).toBeVisible();
    await expect(documents).not.toBeChecked();
    await expect(page).toHaveURL(`/app/collections/${collection.id}?tab=links&link=main`);

    await sheet.getByRole('button', { name: 'Скасувати' }).click();
    await expect(documents).toBeChecked();
    await expect(save).toHaveCount(0);

    await documents.click();
    await sheet.getByRole('radio', { name: /^Вміст усіх гостей/ }).click();
    await save.click();
    await expect(toast(page).filter({ hasText: 'Права збережено' })).toBeVisible();
    await page.reload();
    sheet = sheetOf(page, T.main);
    await expect(sheet.getByRole('checkbox', { name: 'Документи' })).not.toBeChecked();
    await expect(sheet.getByRole('checkbox', { name: 'Фото' })).toBeChecked();
    await expect(sheet.getByRole('radio', { name: /^Вміст усіх гостей/ })).toBeChecked();

    // Nothing to add: a warning that the link is view-only.
    for (const type of ['Фото', 'Відео', 'Побажання']) {
      await sheet.getByRole('checkbox', { name: type }).click();
    }
    await expect(sheet.getByText('Гості нічого не зможуть додати')).toBeVisible();
  });

  test('replacing the main link asks for its name, then shows the new link in the sheet', async ({
    page,
  }) => {
    const collection = await openLinks(page, 'Випускний');
    const sheet = await openLink(page, T.main);
    const before = await sheet.getByRole('textbox', { name: T.guestLink }).inputValue();
    await sheet.getByRole('button', { name: T.rotate }).click();
    const dialog = page.getByRole('alertdialog', { name: `Оновити «${T.main}»?` });
    await expect(dialog).toContainText('надрукований QR перестануть працювати');
    const confirm = dialog.getByRole('button', { name: 'Оновити' });
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    const phrase = dialog.getByRole('textbox', { name: `Щоб підтвердити, введіть «${T.main}»` });
    await expect(phrase).toBeFocused();
    await phrase.fill(T.main);
    await expect(confirm).not.toHaveAttribute('aria-disabled');
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(toast(page).filter({ hasText: 'Посилання оновлено' })).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: T.guestLink })).not.toHaveValue(before);
    // `main` follows the new default, so the sheet and its address keep working.
    await expect(page).toHaveURL(`/app/collections/${collection.id}?tab=links&link=main`);
  });

  test('an additional link is created, revoked into the record, and removed from it', async ({
    page,
  }) => {
    const collection = await openLinks(page, 'Корпоратив');
    const all = await openAll(page);
    await all.getByRole('button', { name: 'Нове посилання' }).click();
    const create = page.getByRole('dialog', { name: 'Нове посилання' });
    await create.getByRole('textbox', { name: 'Назва' }).fill('Фотограф');
    await create.getByRole('checkbox', { name: 'Побажання' }).click();
    await create.getByRole('button', { name: 'Створити' }).click();
    await expect(toast(page).filter({ hasText: 'Посилання створено' })).toBeVisible();

    const section = all.getByRole('region', { name: 'Додаткові посилання' });
    await expect(section.locator('[data-slot="extra-links-count"]')).toHaveText('1');
    await closeToasts(page);
    await rowAct(row(all, 'Фотограф'), 'Фотограф', 'Керувати');
    const sheet = sheetOf(page, 'Фотограф');
    await expect(page).toHaveURL(
      new RegExp(`/app/collections/${collection.id}\\?tab=links&link=[0-9a-f-]{36}$`),
    );
    await expect(sheet.getByRole('checkbox', { name: 'Побажання' })).not.toBeChecked();

    await sheet.getByRole('button', { name: 'Відкликати посилання' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Відкликати «Фотограф»?' });
    await dialog.getByRole('textbox').fill('Фотограф');
    await dialog.getByRole('button', { name: 'Відкликати' }).click();
    await expect(
      page.locator('[data-slot="toast"][data-variant="info"]', { hasText: 'Посилання відкликано' }),
    ).toBeVisible();
    // The sheet closes; on the tab the link is now a struck-through record.
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(`/app/collections/${collection.id}?tab=links`);
    await expect(row(all, 'Фотограф')).toHaveCount(0);
    const record = all.getByRole('region', { name: 'Відкликані' });
    const label = record.getByText('Фотограф', { exact: true });
    await expect(label).toHaveCSS('text-decoration-line', 'line-through');

    await closeToasts(page);
    // The record can go too: a plain confirm, the link no longer works anyway.
    await record.getByRole('button', { name: 'Прибрати «Фотограф» з історії' }).click();
    const remove = page.getByRole('alertdialog', { name: 'Прибрати «Фотограф» з історії?' });
    await remove.getByRole('button', { name: 'Прибрати' }).click();
    await expect(toast(page).filter({ hasText: 'Прибрано з історії' })).toBeVisible();
    await expect(record).toBeHidden();
  });

  test('deleting an additional link asks for its name and removes it from the list', async ({
    page,
  }) => {
    await openLinks(page, 'Випускний 11-Б');
    const all = await openAll(page);
    await all.getByRole('button', { name: 'Нове посилання' }).click();
    const create = page.getByRole('dialog', { name: 'Нове посилання' });
    await create.getByRole('textbox', { name: 'Назва' }).fill('Батьки');
    await create.getByRole('button', { name: 'Створити' }).click();
    await expect(toast(page).filter({ hasText: 'Посилання створено' })).toBeVisible();
    await closeToasts(page);
    await rowAct(row(all, 'Батьки'), 'Батьки', 'Керувати');
    const sheet = sheetOf(page, 'Батьки');
    await expect(sheet).toBeVisible();
    const sheetUrl = page.url();

    await sheet.getByRole('button', { name: 'Видалити посилання' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Видалити «Батьки»?' });
    const confirm = dialog.getByRole('button', { name: 'Видалити' });
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await dialog.getByRole('textbox', { name: 'Щоб підтвердити, введіть «Батьки»' }).fill('Батьки');
    await confirm.click();
    await expect(toast(page).filter({ hasText: 'Посилання видалено' })).toBeVisible();
    // Gone from the tab's list, not moved to the record.
    await expect(sheet).toBeHidden();
    await expect(all.getByText('Додаткових посилань ще немає')).toBeVisible();
    await expect(all.getByRole('region', { name: 'Відкликані' })).toHaveCount(0);
    // Its old address now says it is gone.
    await page.goto(sheetUrl);
    await expect(page.getByRole('dialog', { name: 'Посилання не знайдено' })).toBeVisible();
    await sheetOf(page, 'Посилання не знайдено')
      .getByRole('button', { name: 'Закрити', exact: true })
      .click();
    await expect(page.getByRole('tab', { name: /^Посилання/ })).toHaveText('Посилання1');
  });

  test('a link is paused and resumed in its sheet, the row shows it; an additional one is deleted from its sheet', async ({
    page,
  }) => {
    await openLinks(page, 'Ювілей');
    const main = row(page.locator('main'), T.main);
    // Only «Керувати» on a row: no pause and no delete there.
    await expect(main.getByRole('button', { name: /Призупинити|Відновити|Видалити/ })).toHaveCount(
      0,
    );
    await rowAct(main, T.main, 'Керувати');
    const sheet = sheetOf(page, T.main);
    await sheet.getByRole('switch', { name: T.works }).click();
    await expect(
      page.locator('[data-slot="toast"][data-variant="warning"]', {
        hasText: 'Посилання призупинено',
      }),
    ).toBeVisible();
    await expect(sheet.getByRole('switch', { name: T.works })).not.toBeChecked();
    await sheet.getByRole('button', { name: 'Закрити', exact: true }).click();
    await expect(main.getByText(T.paused, { exact: true })).toBeVisible();
    await rowAct(main, T.main, 'Керувати');
    await sheet.getByRole('switch', { name: T.works }).click();
    await expect(sheet.getByRole('switch', { name: T.works })).toBeChecked();
    await sheet.getByRole('button', { name: 'Закрити', exact: true }).click();
    await expect(main.getByText(T.active, { exact: true })).toBeVisible();

    // On a phone the pause/resume toasts sit over the create dialog's buttons.
    await closeToasts(page);
    const all = await openAll(page);
    await all.getByRole('button', { name: 'Нове посилання' }).click();
    const create = page.getByRole('dialog', { name: 'Нове посилання' });
    await create.getByRole('textbox', { name: 'Назва' }).fill('Батьки');
    await create.getByRole('button', { name: 'Створити' }).click();
    await expect(row(all, 'Батьки')).toBeVisible();
    await closeToasts(page);
    await rowAct(row(all, 'Батьки'), 'Батьки', 'Керувати');
    await sheetOf(page, 'Батьки').getByRole('button', { name: 'Видалити посилання' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Видалити «Батьки»?' });
    await dialog.getByRole('textbox').fill('Батьки');
    await dialog.getByRole('button', { name: 'Видалити' }).click();
    await expect(toast(page).filter({ hasText: 'Посилання видалено' })).toBeVisible();
    await expect(row(all, 'Батьки')).toHaveCount(0);
    await expect(all.getByText('Додаткових посилань ще немає')).toBeVisible();
  });
});

test.describe('sharing from the collection page', () => {
  test('Share shows the same link as the page; a paused link is flagged on the dashboard and in Share', async ({
    page,
  }) => {
    const collection = await openLinks(page, 'Хрестини Марійки');
    const linkUrl = await row(page.locator('main'), T.main).getByText(/\/g\//).innerText();

    // Share from the main link's «⋯»: the same URL and its QR.
    const actions = row(page.locator('main'), T.main).getByRole('button', {
      name: `Показати QR-код і поділитися «${T.main}»`,
    });
    await row(page.locator('main'), T.main)
      .getByRole('button', { name: `Показати QR-код і поділитися «${T.main}»` })
      .click();
    const dialog = page.getByRole('dialog', { name: T.shareTitle });
    await expect(dialog.getByRole('img', { name: `QR-код посилання “${T.main}”` })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: T.link })).toHaveValue(linkUrl);
    // Its state and Open (in a new tab) too.
    await expect(dialog.locator('[data-slot="share-link-status"]')).toHaveText(/Активне$/);
    await expect(dialog.getByRole('link', { name: /^Відкрити/ })).toHaveAttribute('href', linkUrl);
    // Keyboard: Escape closes it and focus goes back to the button that opened it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(actions).toBeFocused();

    // Pause in the link's settings; the dashboard says so without a reload.
    await page.goto(`/app/collections/${collection.id}?tab=links&link=main`);
    const sheet = sheetOf(page, T.main);
    await sheet.getByRole('switch', { name: T.works }).click();
    // Paused is a state to come back to: a warning toast, not a success.
    await expect(
      page.locator('[data-slot="toast"][data-variant="warning"]', {
        hasText: 'Посилання призупинено',
      }),
    ).toBeVisible();
    await expect(sheet.getByText(T.paused, { exact: true })).toBeVisible();
    await expect(sheet.getByText('побачать «Посилання призупинене»')).toBeVisible();
    await page.goto('/app');
    const card = page.locator('[data-slot="collection-card"]', { hasText: 'Хрестини Марійки' });
    await expect(card.getByText('Посилання призупинене')).toBeVisible();

    // The Share dialog warns and resumes in place; the card is active again.
    await page.goto(`/app/collections/${collection.id}?tab=links`);
    // A paused row says so; the dashboard's «Поділитися» still reaches the dialog, which warns
    // and turns it on in place.
    await expect(
      row(page.locator('main'), T.main).getByText(T.paused, { exact: true }),
    ).toBeVisible();
    await page.goto('/app');
    await card.getByRole('button', { name: 'Поділитися' }).click();
    await expect(
      dialog.getByText('Посилання призупинене — гості його не відкриють.'),
    ).toBeVisible();
    // Nothing to hand out while it is paused.
    await expect(dialog.getByRole('button', { name: 'Копіювати посилання' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await dialog.getByRole('button', { name: 'Увімкнути' }).click();
    await expect(dialog.getByText('Посилання призупинене — гості його не відкриють.')).toBeHidden();
    // Escape would first dismiss the «resumed» toast (the top layer); close the dialog itself.
    await dialog.getByRole('button', { name: 'Закрити' }).first().click();
    await page.goto('/app');
    await expect(card.getByText('Посилання активне')).toBeVisible();
  });
});
