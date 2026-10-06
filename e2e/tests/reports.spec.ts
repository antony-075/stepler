import { expect, test } from '@playwright/test';
import { newEmail, signIn } from '../support/auth.js';
import { horizontalOverflow } from '../support/collections.js';
import { openGuestLink, submitTextViaApi } from '../support/guest.js';
import { guestApi, sharedCollection } from '../support/reports.js';

// Slice 9, R1: a guest reports another guest's frame from the viewer's «⋯». Phones and desktop.

// Ukrainian UI (no supported browser language → default locale).
test.use({ locale: 'de-DE' });

test.describe('guest reports', () => {
  test('guest B reports guest A’s wish; the wish stays; B’s own frame has no «⋯»', async ({
    page,
    browser,
  }) => {
    await signIn(page, newEmail());
    const { collectionId, linkPath } = await sharedCollection(page);

    const a = await openGuestLink(browser, linkPath);
    await expect(a.getByRole('heading', { level: 1 })).toBeVisible();
    await submitTextViaApi(a, collectionId, 'Від гостя А');
    await a.context().close();

    const b = await openGuestLink(browser, linkPath);
    await expect(b.getByRole('heading', { level: 1 })).toBeVisible();
    const all = b.getByRole('list', { name: 'Усі кадри колекції' });
    await all.getByRole('button', { name: /^Побажання, / }).click();
    const viewer = b.getByRole('dialog').filter({ hasText: 'Від гостя А' });
    await viewer.getByRole('button', { name: 'Більше дій' }).click();
    await b.getByRole('menuitem', { name: 'Поскаржитися' }).click();

    const form = b.getByRole('dialog', { name: 'Поскаржитися' });
    await form.getByRole('radio', { name: 'Порушує приватність' }).click();
    await form.getByLabel('Ваш e-mail').fill('olena@example.com');
    expect(await horizontalOverflow(b)).toBeLessThanOrEqual(0);
    const send = form.getByRole('button', { name: 'Надіслати скаргу' });
    await send.scrollIntoViewIfNeeded();
    await expect(send).toBeInViewport();
    await send.click();
    await expect(b.getByRole('heading', { name: 'Скаргу надіслано' })).toBeVisible();
    await b.getByRole('button', { name: 'Закрити' }).first().click();
    await b.keyboard.press('Escape');

    // The frame stays in «Усі кадри» (no automatic action).
    await expect(all.getByText('Від гостя А')).toBeVisible();

    // B's own frame: no «⋯».
    await submitTextViaApi(b, collectionId, 'Від гостя Б');
    await b.reload();
    await b
      .getByRole('button', { name: /^Кадр \d+, побажання, / })
      .first()
      .click();
    const own = b.getByRole('dialog').filter({ hasText: 'Від гостя Б' });
    await expect(own).toBeVisible();
    await expect(own.getByRole('button', { name: 'Більше дій' })).toHaveCount(0);
    await b.context().close();
  });

  test('the admin sees the report, hides and shows the frame, and dismisses @desktop', async ({
    page,
    browser,
  }) => {
    await signIn(page, newEmail());
    const { collectionId, linkPath } = await sharedCollection(page);
    const baseURL = new URL(page.url()).origin;
    const a = await guestApi(baseURL, collectionId, linkPath);
    const text = await a.post(`/api/v1/guest/collections/${collectionId}/texts`, {
      data: { body: 'Кадр під скаргою' },
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    const { id: contentId } = (await text.json()) as { id: string };
    const b = await guestApi(baseURL, collectionId, linkPath);
    const report = await b.post(
      `/api/v1/guest/collections/${collectionId}/content/${contentId}/reports`,
      {
        data: { reason: 'PRIVACY', email: 'reporter@stepler.test', locale: 'uk' },
        headers: { 'idempotency-key': crypto.randomUUID() },
      },
    );
    expect(report.status()).toBe(201);
    await b.dispose();

    await page.goto(`/app/collections/${collectionId}`);
    const chip = page
      .getByRole('radio', { name: /Скарги/ })
      .or(page.getByRole('button', { name: /Скарги/ }));
    await expect(chip.first()).toContainText('1');
    const tile = page.getByRole('button', { name: /^Кадр 1, .*скарга/ });
    await expect(tile).toBeVisible();
    await tile.click();
    const viewer = page.getByRole('dialog', { name: /#001/ });
    await expect(viewer).toContainText('Порушує приватність');
    expect(await page.content()).not.toContain('reporter@stepler.test');

    await viewer.getByRole('button', { name: 'Приховати від гостей' }).click();
    await expect(viewer.getByRole('button', { name: 'Показати гостям' })).toBeVisible();
    await viewer.getByRole('button', { name: 'Закрити' }).click();
    await expect(page.getByRole('button', { name: /^Кадр 1, .*приховано/ })).toBeVisible();

    // Guests no longer get it: another guest's «Усі кадри», and the contributor's own frames.
    const guest = await openGuestLink(browser, linkPath);
    await expect(guest.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(guest.getByText('Кадр під скаргою')).toHaveCount(0);
    const own = await a.get(`/api/v1/guest/collections/${collectionId}/content?scope=own`);
    expect(((await own.json()) as { items: unknown[] }).items).toHaveLength(0);

    await page.getByRole('button', { name: /^Кадр 1, / }).click();
    await viewer.getByRole('button', { name: 'Показати гостям' }).click();
    await expect(viewer.getByRole('button', { name: 'Приховати від гостей' })).toBeVisible();
    await guest.reload();
    await expect(guest.getByText('Кадр під скаргою')).toBeVisible();

    await viewer.getByRole('button', { name: 'Відхилити скарги' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Відхилити' }).click();
    await expect(viewer.getByRole('button', { name: 'Відхилити скарги' })).toHaveCount(0);
    await viewer.getByRole('button', { name: 'Закрити' }).click();
    await expect(page.getByRole('button', { name: /^Кадр 1, .*скарга/ })).toHaveCount(0);
    await expect(chip).toHaveCount(0);
    await a.dispose();
    await guest.context().close();
  });
});
