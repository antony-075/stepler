import { expect, type Page, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { openGuestLink } from '../support/guest.js';
import { signInAsOperator } from '../support/operator.js';
import { guestApi, seedReport } from '../support/reports.js';

// Slice 9b: the operator's deletion is a quarantine the admin sees greyed, with the reason and
// the purge date, and appeals in place; the operator decides in the console's appeal queue.

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

/** One of the operator's content actions, through the API the console calls. */
async function operatorAction(ops: Page, contentId: string, action: string, reason: string) {
  const origin = new URL(ops.url()).origin;
  const res = await ops.request.post(`/api/v1/operator/content/${contentId}/${action}`, {
    data: { reason },
    headers: { origin },
  });
  expect(res.status()).toBe(204);
}

/** The admin's appeal through the API the app calls (the dialog is covered above). */
async function appealViaApi(admin: Page, path: string, text: string) {
  const origin = new URL(admin.url()).origin;
  const res = await admin.request.post(`/api/v1/collections/${path}/appeals`, {
    data: { text },
    headers: { origin },
  });
  expect(res.status()).toBe(201);
}

/**
 * From the console's nav: «Апеляції адміністраторів» → this collection's appeal in «Нові» (other
 * workers add theirs to the same queue) about `measure` → the admin's text → the decision.
 */
async function decideAppeal(
  ops: Page,
  {
    collection,
    measure,
    text,
    decision,
    note,
  }: { collection: string; measure: string; text: string; decision: string; note: string },
) {
  await ops.goto('/ops/reports');
  const nav = ops.getByRole('navigation', { name: 'Розділи консолі' });
  await nav.getByRole('link', { name: 'Апеляції адміністраторів' }).click();
  await expect(ops).toHaveURL(/\/ops\/appeals/);
  await expect(nav.getByRole('link', { name: 'Апеляції адміністраторів' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // The table row (desktop) or the card (phones) of this collection, with the measure's badge.
  const row = ops
    .locator('tr, li')
    .filter({ hasText: collection })
    .filter({ visible: true })
    .first();
  await expect(row).toContainText(measure);
  await row.locator('a[href^="/ops/appeals/"]').click();
  await expect(ops.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(ops.getByRole('main')).toContainText(text);
  await ops.getByRole('button', { name: decision, exact: true }).click();
  const dialog = ops.getByRole('dialog');
  await dialog.getByRole('textbox').fill(note);
  await dialog.getByRole('button', { name: decision, exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('appeals', () => {
  test('a quarantined frame: greyed for its admin, appealed in place', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    await signIn(page, newEmail());
    const seeded = await seedReport(page);
    const ops = await (await browser.newContext({ locale: 'de-DE' })).newPage();
    await signInAsOperator(ops, testInfo);
    await operatorAction(ops, seeded.contentId, 'quarantine', 'Незаконний вміст');

    await page.goto(`/app/collections/${seeded.collectionId}`);
    const tile = page.getByRole('button', { name: /^Кадр 1, .*видалено модерацією/ });
    await expect(tile).toBeVisible();
    await expect(
      page.locator(`[data-frame="${seeded.frameNo}"] [data-slot="frame-face"]`),
    ).toHaveAttribute('data-dimmed', 'true');
    await expect(
      page.locator(`[data-frame="${seeded.frameNo}"] [data-slot="frame-ring"]`),
    ).toHaveAttribute('data-ring', 'destructive');
    const stateMenu = page.getByRole('button', { name: /^Стан:/ });
    await stateMenu.click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: /^Видалено модерацією/ }),
    ).toContainText('1');
    await page.keyboard.press('Escape');

    await tile.click();
    const viewer = page.getByRole('dialog', { name: /#001/ });
    await expect(viewer).toContainText('Причина: Незаконний вміст');
    await expect(viewer).toContainText('буде видалено назавжди');
    await expect(viewer.getByRole('link', { name: 'Завантажити' })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Приховати від гостей' })).toHaveCount(0);

    // The appeal: empty text keeps the dialog open; sent, the panel says it is under review.
    await viewer.getByRole('button', { name: 'Подати апеляцію' }).click();
    const form = page.getByRole('dialog', { name: 'Апеляція щодо кадру' });
    await form.getByRole('button', { name: 'Надіслати' }).click();
    await expect(form.getByRole('alert')).toHaveText('Напишіть пояснення');
    await form.getByLabel('Ваше пояснення').fill('Це наш власний текст, нічого незаконного.');
    await form.getByRole('button', { name: 'Надіслати' }).click();
    // Sent, the dialog is named by its confirmation.
    const sent = page.getByRole('dialog', { name: 'Апеляцію надіслано' });
    await expect(sent.getByRole('heading', { name: 'Апеляцію надіслано' })).toBeFocused();
    await sent.getByRole('button', { name: 'Закрити' }).click();
    await expect(sent).toBeHidden();
    await expect(viewer).toContainText('Розглядається');
    await expect(viewer.getByRole('button', { name: 'Подати апеляцію' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    // The operator upholds it in the console: the frame is back for guests.
    await decideAppeal(ops, {
      collection: seeded.title,
      measure: 'У карантині',
      text: 'Це наш власний текст, нічого незаконного.',
      decision: 'Задовольнити',
      note: 'Помилка модерації',
    });
    await expect(ops.getByText('Задоволені', { exact: true }).first()).toBeVisible();
    const guest = await guestApi(new URL(page.url()).origin, seeded.collectionId, seeded.linkPath);
    const back = await guest.get(
      `/api/v1/guest/collections/${seeded.collectionId}/content/${seeded.contentId}`,
    );
    expect(back.status()).toBe(200);
    await guest.dispose();
    // The bare collection URL: a reload would reopen the viewer from `?frame=`.
    await page.goto(`/app/collections/${seeded.collectionId}`);
    await page.getByRole('button', { name: /^Кадр 1, / }).click();
    await expect(page.getByRole('dialog', { name: /#001/ })).toContainText('Апеляцію задоволено');
    await ops.context().close();
  });

  test('an operator hide, appealed and rejected: the admin reads the note', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    await signIn(page, newEmail());
    const seeded = await seedReport(page);
    const ops = await (await browser.newContext({ locale: 'de-DE' })).newPage();
    await signInAsOperator(ops, testInfo);
    await operatorAction(ops, seeded.contentId, 'hide', 'Спам');
    await page.goto(`/app/collections/${seeded.collectionId}`);
    await appealViaApi(
      page,
      `${seeded.collectionId}/content/${seeded.contentId}`,
      'Це не спам, це привітання.',
    );

    await decideAppeal(ops, {
      collection: seeded.title,
      measure: 'Приховано',
      text: 'Це не спам, це привітання.',
      decision: 'Відхилити',
      note: 'Повторює рекламу',
    });

    await page.getByRole('button', { name: /^Кадр 1, / }).click();
    const viewer = page.getByRole('dialog', { name: /#001/ });
    await expect(viewer).toContainText('Апеляцію відхилено: Повторює рекламу');
    // A new appeal is allowed after a decision.
    await expect(viewer.getByRole('button', { name: 'Подати апеляцію' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await ops.context().close();
  });

  test('a blocked collection: the banner appeal, upheld, opens it to guests again', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(90_000);
    await signIn(page, newEmail());
    const seeded = await seedReport(page, { title: 'Ювілей бабусі' });
    const ops = await (await browser.newContext({ locale: 'de-DE' })).newPage();
    await signInAsOperator(ops, testInfo);
    const origin = new URL(ops.url()).origin;
    const blocked = await ops.request.post(
      `/api/v1/operator/collections/${seeded.collectionId}/block`,
      { data: { reason: 'Спам у колекції' }, headers: { origin } },
    );
    expect(blocked.status()).toBe(204);

    await page.goto(`/app/collections/${seeded.collectionId}`);
    const banner = page.getByRole('status').filter({ hasText: 'Колекцію заблоковано модерацією' });
    await banner.getByRole('button', { name: 'Подати апеляцію' }).click();
    const form = page.getByRole('dialog', { name: 'Апеляція щодо блокування' });
    await form.getByLabel('Ваше пояснення').fill('Це сімейна колекція.');
    await form.getByRole('button', { name: 'Надіслати' }).click();
    const sent = page.getByRole('dialog', { name: 'Апеляцію надіслано' });
    await sent.getByRole('button', { name: 'Закрити' }).click();
    await expect(banner).toContainText('Розглядається');

    await decideAppeal(ops, {
      collection: seeded.title,
      measure: 'Заблоковано',
      text: 'Це сімейна колекція.',
      decision: 'Задовольнити',
      note: 'Розблоковано',
    });
    const guest = await openGuestLink(browser, seeded.linkPath);
    await expect(guest.getByRole('heading', { name: 'Ювілей бабусі' })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Колекцію заблоковано модерацією')).toHaveCount(0);
    await guest.context().close();
    await ops.context().close();
  });
});
